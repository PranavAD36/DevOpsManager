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
  owner: string;
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

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.detail ?? 'Request failed');
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
  getGithubAuthorizationUrl: () => request<{ authorization_url: string }>('/v1/github/authorize'),
  getGithubConnection: () => request<{ connected: boolean; username: string }>('/v1/github/me'),
  listGithubRepositories: () => request<GitHubRepository[]>('/v1/github/repositories'),
  connectGithubRepository: (repositoryId: number) => request<{ project_id: string; repository_id: string; message: string }>('/v1/github/repositories/connect', { method: 'POST', body: JSON.stringify({ repository_id: repositoryId }) }),
};

