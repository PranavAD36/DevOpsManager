import logging
import os
import re
from pathlib import Path

from langchain_community.vectorstores import FAISS
from langchain_google_genai import GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document

from app.core.config import settings
from app.integrations.github_app import GitHubAppService, is_relevant_source_path
from app.services.ai_service import AIProviderError, complete_text
from app.services.secret_detection import scan_and_exclude_secret_files, redact_secrets
from app.services.secret_notes import write_secret_note

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

    files, _ = scan_and_exclude_secret_files(files)
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

    try:
        embeddings = get_embeddings_model()
        vectorstore = FAISS.from_documents(chunks, embeddings)
    except Exception as exc:  # noqa: BLE001 - indexing is optional; never crash the worker
        logger.warning(
            "Semantic indexing skipped for %s/%s (%s). Repository chat works without the index.",
            owner,
            repo_name,
            exc,
        )
        return
    
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
    
    context = "\n\n".join([f"File: {doc.metadata.get('source')}\n```\n{redact_secrets(doc.page_content)}\n```" for doc in relevant_docs])
    
    llm = get_llm()
    prompt = f"""You are a helpful software engineering assistant with access to the source code of a repository.
Answer the user's question based ONLY on the provided context. If the answer cannot be found in the context, say "I don't know based on the provided codebase."

Context:
{context}

Question: {query}
"""
    response = await llm.ainvoke(prompt)
    return redact_secrets(str(response.content))


_TOKEN_RE = re.compile(r"[A-Za-z_][A-Za-z0-9_]{2,}")


def _query_terms(query: str) -> set[str]:
    return {token.lower() for token in _TOKEN_RE.findall(query)}


def select_relevant_chunks(
    files: list[object],
    query: str,
    max_chunks: int = 8,
    lines_per_chunk: int = 60,
) -> list[tuple[str, str]]:
    """Pick the most relevant file chunks for a question without needing embeddings."""
    chunks: list[tuple[str, str, int]] = []
    for source_file in files:
        path = str(getattr(source_file, "path", "") or "")
        content = str(getattr(source_file, "content", "") or "")
        if not path or not content.strip():
            continue
        lines = content.splitlines()
        for start in range(0, max(1, len(lines)), lines_per_chunk):
            chunk = "\n".join(lines[start : start + lines_per_chunk])
            if not chunk.strip():
                continue
            haystack = f"{path}\n{chunk}".lower()
            score = sum(haystack.count(term) for term in _query_terms(query))
            if path.lower().split("/")[-1] in query.lower():
                score += 5
            chunks.append((path, chunk, score))
    if not chunks:
        return []
    chunks.sort(key=lambda item: item[2], reverse=True)
    top = [chunk for chunk in chunks if chunk[2] > 0][:max_chunks]
    if not top:
        top = chunks[:max_chunks]
    return [(path, chunk) for path, chunk, _ in top]


async def answer_repository_question(repository: object, access_token: str, query: str) -> str:
    """Answer a question about a repository using the configured AI provider.

    Retrieval is a lightweight in-process lexical search over files fetched from GitHub, so it
    does not require embeddings or a pre-built FAISS index.
    """
    repository_name = str(getattr(repository, "full_name", "") or "")
    service = GitHubAppService()
    files = await service.get_repository_source_files(
        access_token,
        str(getattr(repository, "owner", "")),
        str(getattr(repository, "name", "")),
        str(getattr(repository, "default_branch", "main")),
        include_sensitive_files=True,
    )
    files, secret_findings = scan_and_exclude_secret_files(files)
    files = [item for item in files if is_relevant_source_path(str(getattr(item, "path", "") or ""))]

    secret_notice = ""
    if secret_findings:
        write_secret_note(repository_name, secret_findings)
        locations = ", ".join(
            f"{finding.file_path}:{finding.line_number}" for finding in secret_findings[:5]
        )
        secret_notice = (
            f"> **Secret warning** - {len(secret_findings)} credential-like value(s) were found in this "
            f"repository and were deliberately left out of the analysis ({locations}). "
            "Values are masked and saved to a local, git-ignored note file.\n\n"
        )

    if not files:
        return secret_notice + "I could not find any readable source files in this repository."

    chunks = select_relevant_chunks(files, query)
    if not chunks:
        return secret_notice + "I could not find relevant code for that question in this repository."

    context = "\n\n".join(
        f"File: {path}\n```\n{redact_secrets(chunk)}\n```" for path, chunk in chunks
    )
    prompt = (
        "Answer the question using ONLY the repository context below. "
        "If the answer is not present, say you could not find it in the provided code and suggest what to check. "
        "Never invent code, files, or behaviour that is not in the context.\n\n"
        "Formatting rules:\n"
        "- Reply in GitHub-flavoured Markdown, like a code assistant such as GitHub Copilot.\n"
        "- Start with a single-sentence summary, then use short bullets or numbered steps.\n"
        "- Put every piece of code in a fenced block with a language tag, for example ```python.\n"
        "- Reference files as `path/to/file.ext` and mention line numbers where helpful.\n"
        "- Use **bold** for key terms and `inline code` for identifiers. Keep it concise.\n\n"
        f"Repository: {repository_name}\n\n"
        f"Context:\n{context}\n\n"
        f"Question: {query}\n"
    )
    answer = await complete_text(
        prompt,
        system=(
            "You are a precise software engineering assistant that answers like GitHub Copilot. "
            "You always reply in clean Markdown with fenced code blocks. Never fabricate code or facts."
        ),
    )
    return redact_secrets(secret_notice + answer)
