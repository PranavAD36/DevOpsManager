import logging
import os
from pathlib import Path

from langchain_community.vectorstores import FAISS
from langchain_google_genai import GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.schema import Document

from app.core.config import settings
from app.integrations.github_app import GitHubAppService

logger = logging.getLogger(__name__)

VECTOR_STORE_DIR = Path(__file__).resolve().parents[2] / "data" / "vector_stores"

def get_embeddings_model():
    if not settings.gemini_api_key:
        raise ValueError("Gemini API key is required for embeddings")
    return GoogleGenerativeAIEmbeddings(
        model="models/text-embedding-004", 
        google_api_key=settings.gemini_api_key
    )

def get_llm():
    if not settings.gemini_api_key:
        raise ValueError("Gemini API key is required for RAG chat")
    return ChatGoogleGenerativeAI(
        model=settings.gemini_model,
        google_api_key=settings.gemini_api_key,
        temperature=0.2
    )

async def index_repository(
    repository_id: str,
    owner: str,
    repo_name: str,
    default_branch: str,
    access_token: str
) -> None:
    github_service = GitHubAppService()
    try:
        files = await github_service.get_repository_source_files(
            access_token, owner, repo_name, default_branch
        )
    except Exception as e:
        logger.error(f"Failed to fetch files for RAG index {owner}/{repo_name}: {e}")
        raise

    if not files:
        logger.warning(f"No valid source files found for {owner}/{repo_name}")
        return

    documents = []
    for f in files:
        # Add metadata so we know where the chunk came from
        documents.append(Document(page_content=f.content, metadata={"source": f.path}))
        
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
    chunks = text_splitter.split_documents(documents)

    if not chunks:
        logger.warning("No chunks generated for indexing")
        return

    embeddings = get_embeddings_model()
    vectorstore = FAISS.from_documents(chunks, embeddings)
    
    # Save locally
    repo_dir = VECTOR_STORE_DIR / str(repository_id)
    repo_dir.mkdir(parents=True, exist_ok=True)
    vectorstore.save_local(str(repo_dir))
    logger.info(f"Successfully indexed {len(chunks)} chunks for {owner}/{repo_name}")

async def chat_with_repo(repository_id: str, query: str) -> str:
    repo_dir = VECTOR_STORE_DIR / str(repository_id)
    if not repo_dir.exists():
        return "This repository has not been indexed yet. Please index it first."
        
    try:
        embeddings = get_embeddings_model()
        vectorstore = FAISS.load_local(str(repo_dir), embeddings, allow_dangerous_deserialization=True)
    except Exception as e:
        logger.error(f"Failed to load FAISS index: {e}")
        return "Failed to load the repository index."
        
    retriever = vectorstore.as_retriever(search_kwargs={"k": 10})
    relevant_docs = await retriever.ainvoke(query)
    
    context = "\n\n".join([f"File: {doc.metadata.get('source')}\n```\n{doc.page_content}\n```" for doc in relevant_docs])
    
    llm = get_llm()
    prompt = f"""You are a helpful software engineering assistant with access to the source code of a repository.
Answer the user's question based ONLY on the provided context. If the answer cannot be found in the context, say "I don't know based on the provided codebase."

Context:
{context}

Question: {query}
"""
    response = await llm.ainvoke(prompt)
    return response.content
