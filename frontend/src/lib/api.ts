import { API_BASE_URL } from './constants';

export type Project = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type Repository = {
  id: string;
  project_id: string;
  owner: string | { login: string };
  name: string;
  full_name: string;
  url: string;
  default_branch: string;
  provider: string;
  is_active: boolean;
  github_description: string | null;
  is_private: boolean | null;
  is_fork: boolean | null;
  language: string | null;
  stargazers_count: number | null;
  forks_count: number | null;
  open_issues_count: number | null;
  repository_size: number | null;
  github_created_at: string | null;
  github_updated_at: string | null;
  pushed_at: string | null;
};

export type AnalysisRun = {
  id: string;
  project_id: string;
  repository_id: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  summary: string | null;
  error_message: string | null;
  created_at: string;
};

export type Issue = {
  id: string;
  project_id: string;
  repository_id: string | null;
  analysis_run_id?: string | null;
  title: string;
  description: string | null;
  severity: string;
  status: string;
  category: string | null;
  file_path: string | null;
  line_number: number | null;
  suggested_fix: string | null;
  corrected_code: string | null;
  approved_at: string | null;
  original_content?: string | null;
  commit_sha?: string | null;
  commit_message?: string | null;
  commit_url?: string | null;
};

export type GitHubRepository = {
  id: number;
  name: string;
  full_name: string;
  owner: string;
  private: boolean;
  default_branch: string;
  html_url: string;
  description: string | null;
  permissions: Record<string, boolean> | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
};

type RepositoryInput = {
  owner: string;
  name: string;
  full_name: string;
  url: string;
  default_branch?: string;
};

type GitHubConnectRepositoryInput = {
  full_name: string;
  owner?: string | null;
  name?: string | null;
  html_url?: string | null;
  default_branch?: string;
  description?: string | null;
};

async function parseErrorMessage(response: Response): Promise<string> {
  const errorBody = await response.json().catch(() => null);

  if (!errorBody) {
    return `Request failed (${response.status})`;
  }

  if (typeof errorBody.detail === 'string') {
    return errorBody.detail;
  }

  if (Array.isArray(errorBody.detail)) {
    const messages = errorBody.detail
      .map((item: any) => {
        if (typeof item === 'string') return item;
        if (typeof item?.msg === 'string') return item.msg;
        if (typeof item?.message === 'string') return item.message;
        return JSON.stringify(item);
      })
      .filter(Boolean);

    if (messages.length) {
      return messages.join('; ');
    }
  }

  if (typeof errorBody.message === 'string') {
    return errorBody.message;
  }

  return JSON.stringify(errorBody);
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  if (!response.ok) throw new Error(await parseErrorMessage(response));
  if (response.status === 204) return undefined as T;
  return response.json();
}

export const api = {
  listProjects: () => request<Project[]>('/v1/projects'),
  createProject: (payload: { name: string; description?: string }) => request<Project>('/v1/projects', { method: 'POST', body: JSON.stringify(payload) }),
  getProject: (id: string) => request<Project>(`/v1/projects/${id}`),
  listRepositories: (id: string) => request<Repository[]>(`/v1/projects/${id}/repositories`),
  createRepository: (id: string, payload: RepositoryInput) => request<Repository>(`/v1/projects/${id}/repositories`, { method: 'POST', body: JSON.stringify(payload) }),
  connectRepository: (id: string, url: string) => request<Repository>(`/v1/projects/${id}/repositories/connect`, { method: 'POST', body: JSON.stringify({ url }) }),
  getRepository: (id: string) => request<Repository>(`/v1/repositories/${id}`),
  refreshRepository: (id: string) => request<Repository>(`/v1/repositories/${id}/refresh`, { method: 'POST' }),
  createAnalysisRun: (id: string) => request<AnalysisRun>(`/v1/repositories/${id}/analysis-runs`, { method: 'POST' }),
  listAnalysisRuns: (id: string) => request<AnalysisRun[]>(`/v1/projects/${id}/analysis-runs`),
  listIssues: (id: string) => request<Issue[]>(`/v1/projects/${id}/issues`),
  approveIssueFix: (id: string) => request<Issue>(`/v1/issues/${id}/approve`, { method: 'POST' }),
  rejectIssueFix: (id: string) => request<Issue>(`/v1/issues/${id}/reject`, { method: 'POST' }),
  updateIssueFix: (id: string, payload: { corrected_code?: string; suggested_fix?: string }) => request<Issue>(`/v1/issues/${id}/update-fix`, { method: 'POST', body: JSON.stringify(payload) }),
  applySuggestion: (id: string, commit_message?: string) => request<Issue>(`/v1/analysis/suggestions/${id}/apply`, { method: 'POST', body: JSON.stringify({ commit_message }) }),
  getGithubAuthorizationUrl: () => request<{ authorization_url: string }>('/v1/github/authorize'),
  getGithubConnection: () => request<{ connected: boolean; username: string }>('/v1/github/me'),
  listGithubRepositories: () => request<GitHubRepository[]>('/v1/github/repositories'),
  connectGithubRepository: (payload: GitHubConnectRepositoryInput) => request<{ project_id: string; repository_id: string; message: string }>('/v1/github/repositories/connect', { method: 'POST', body: JSON.stringify(payload) }),
};

