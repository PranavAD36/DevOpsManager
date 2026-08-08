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
};

export type AnalysisRun = {
  id: string;
  project_id: string;
  repository_id: string;
  status: string;
  summary: string | null;
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
};

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
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
  createRepository: (id: string, payload: Omit<Repository, 'id' | 'project_id' | 'provider' | 'is_active'>) => request<Repository>(`/v1/projects/${id}/repositories`, { method: 'POST', body: JSON.stringify(payload) }),
  listAnalysisRuns: (id: string) => request<AnalysisRun[]>(`/v1/projects/${id}/analysis-runs`),
  listIssues: (id: string) => request<Issue[]>(`/v1/projects/${id}/issues`),
};
