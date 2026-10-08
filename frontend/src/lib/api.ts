import { API_BASE_URL } from './constants';

export type Project = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  custom_rules?: string | null;
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
  corrected_code?: string | null;
  fingerprint?: string | null;
  cross_file_fixes?: { file_path: string; original_content: string | null; corrected_code: string }[] | null;
  created_at?: string | null;
  approved_at: string | null;
  original_content?: string | null;
  commit_sha?: string | null;
  commit_message?: string | null;
  commit_url?: string | null;
};

export type CodeHealth = {
  available: boolean;
  score: number | null;
  breakdown: Record<string, number> | null;
  findings_count: number;
  source_analysis_run_id: string | null;
  scoring_method: string;
};

export type SecretFinding = {
  secret_type: string;
  file_path: string;
  line_number: number;
  severity: string;
  masked_value: string;
};

export type WorkflowRun = {
  id: number;
  name: string;
  branch: string | null;
  commit_sha: string | null;
  actor: string | null;
  status: string;
  conclusion: string | null;
  created_at: string | null;
  updated_at: string | null;
  started_at: string | null;
  duration_seconds: number | null;
  html_url: string;
};

export type WorkflowHealth = {
  repository_id: string;
  total_runs: number;
  success_rate: number | null;
  failure_rate: number | null;
  average_duration_seconds: number | null;
  runs: WorkflowRun[];
  recent_failures: WorkflowRun[];
};

export type IncidentAnalysis = {
  incident_summary: string;
  likely_root_cause: string;
  observed_evidence: string[];
  ai_inference: string;
  affected_component: string | null;
  severity: string;
  suggested_fix: string;
  prevention_recommendation: string;
  evidence_sufficient: boolean;
};

export type EngineeringPoint = {
  date: string;
  issues_opened: number;
  issues_resolved: number;
  analyses: number;
  analysis_failures: number;
  ci_runs: number;
  ci_failures: number;
};

export type EngineeringTrends = {
  start_date: string;
  end_date: string;
  repository_id: string | null;
  available_metrics: string[];
  unavailable_metrics: string[];
  series: EngineeringPoint[];
  executive_summary?: string | null;
  security_findings: number;
  code_health: number | null;
  top_problems: string[];
  improvements: string[];
};

export type SecurityFinding = {
  id: string;
  repository_id: string | null;
  repository_name: string | null;
  title: string;
  description: string | null;
  severity: string;
  category: string | null;
  file_path: string | null;
  line_number: number | null;
  status: string;
  detected_at: string;
};

export type SecurityReviewFinding = {
  title: string;
  severity: string;
  category: string;
  file_path: string;
  line_number: number;
  explanation: string;
  evidence: string;
  suggested_fix: string;
  confidence_status: 'confirmed' | 'potential';
};

export type RepositoryComparison = {
  repository_id: string;
  full_name: string;
  code_health: number | null;
  open_issues: number;
  security_findings: number;
  ci_success_rate: number | null;
  unavailable_metrics: string[];
};

export type EngineeringAlert = {
  id: string;
  repository_id: string | null;
  source: string;
  severity: string;
  message: string;
  is_read: boolean;
  status: string;
  created_at: string;
  updated_at: string;
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

export function getStoredAuthToken(): string | null {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('github_access_token');
  }
  return null;
}

export function setAuthToken(token: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('github_access_token', token);
  }
}

export function clearAuthToken(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('github_access_token');
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getStoredAuthToken();
  const authHeaders: Record<string, string> = {};
  if (token) {
    authHeaders['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...options?.headers,
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      clearAuthToken();
      if (typeof window !== 'undefined' && !window.location.pathname.includes('/github/connect')) {
        window.location.href = '/github/connect?error=Session+expired.+Please+log+in+again.';
      }
    }
    throw new Error(await parseErrorMessage(response));
  }
  
  if (response.status === 204) return undefined as T;
  return response.json();
}

export const api = {
  listProjects: () => request<Project[]>('/v1/projects'),
  createProject: (payload: { name: string; description?: string }) => request<Project>('/v1/projects', { method: 'POST', body: JSON.stringify(payload) }),
  getProject: (id: string) => request<Project>(`/v1/projects/${id}`),
  updateProject: (id: string, payload: { name?: string; description?: string; custom_rules?: string | null }) => request<Project>(`/v1/projects/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  listRepositories: (id: string) => request<Repository[]>(`/v1/projects/${id}/repositories`),
  createRepository: (id: string, payload: RepositoryInput) => request<Repository>(`/v1/projects/${id}/repositories`, { method: 'POST', body: JSON.stringify(payload) }),
  connectRepository: (id: string, url: string) => request<Repository>(`/v1/projects/${id}/repositories/connect`, { method: 'POST', body: JSON.stringify({ url }) }),
  getRepository: (id: string) => request<Repository>(`/v1/repositories/${id}`),
  getCodeHealth: (id: string) => request<CodeHealth>(`/v1/repositories/${id}/code-health`),
  scanRepositorySecrets: (id: string) => request<{ repository_id: string; findings: SecretFinding[] }>(`/v1/repositories/${id}/secrets`),
  getWorkflowHealth: (id: string) => request<WorkflowHealth>(`/v1/repositories/${id}/workflows`),
  reviewPullRequestSecurity: (repositoryId: string, pullRequestNumber: number) => request<{ repository_id: string; pull_request_number: number; findings: SecurityReviewFinding[] }>(`/v1/repositories/${repositoryId}/pull-requests/${pullRequestNumber}/security-review`, { method: 'POST' }),
  analyzeIncident: (payload: { source: string; summary?: string; logs?: string; repository_id?: string }) => request<IncidentAnalysis>('/v1/incidents/analyze', { method: 'POST', body: JSON.stringify(payload) }),
  getEngineeringTrends: (projectId: string, days: 7 | 30 | 90, repositoryId?: string) => {
    const query = new URLSearchParams({ days: String(days) });
    if (repositoryId) query.set('repository_id', repositoryId);
    return request<EngineeringTrends>(`/v1/projects/${projectId}/trends?${query.toString()}`);
  },
  getEngineeringReport: (projectId: string, period: 'weekly' | 'monthly' | 'custom', startDate?: string, endDate?: string, repositoryId?: string) => {
    const query = new URLSearchParams({ period });
    if (startDate) query.set('start_date', startDate);
    if (endDate) query.set('end_date', endDate);
    if (repositoryId) query.set('repository_id', repositoryId);
    return request<EngineeringTrends>(`/v1/projects/${projectId}/reports?${query.toString()}`);
  },
  compareRepositories: (repositoryIds: string[]) => request<{ repositories: RepositoryComparison[] }>('/v1/repositories/compare', { method: 'POST', body: JSON.stringify({ repository_ids: repositoryIds }) }),
  listSecurityFindings: (filters?: { severity?: string; repositoryId?: string; status?: string }) => {
    const query = new URLSearchParams();
    if (filters?.severity) query.set('severity', filters.severity);
    if (filters?.repositoryId) query.set('repository_id', filters.repositoryId);
    if (filters?.status) query.set('status', filters.status);
    const suffix = query.size ? `?${query.toString()}` : '';
    return request<SecurityFinding[]>(`/v1/security/findings${suffix}`);
  },
  listAlerts: (status?: 'open' | 'resolved', unreadOnly = false) => {
    const query = new URLSearchParams();
    if (status) query.set('status', status);
    if (unreadOnly) query.set('unread_only', 'true');
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return request<EngineeringAlert[]>(`/v1/alerts${suffix}`);
  },
  updateAlert: (id: string, payload: { is_read?: boolean; status?: 'open' | 'resolved' }) => request<EngineeringAlert>(`/v1/alerts/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  refreshRepository: (id: string) => request<Repository>(`/v1/repositories/${id}/refresh`, { method: 'POST' }),
  createAnalysisRun: (id: string) => request<AnalysisRun>(`/v1/repositories/${id}/analysis-runs`, { method: 'POST' }),
  listAnalysisRuns: (id: string) => request<AnalysisRun[]>(`/v1/projects/${id}/analysis-runs`),
  listIssues: (id: string) => request<Issue[]>(`/v1/projects/${id}/issues`),
  approveIssueFix: (id: string) => request<Issue>(`/v1/issues/${id}/approve`, { method: 'POST' }),
  rejectIssueFix: (id: string) => request<Issue>(`/v1/issues/${id}/reject`, { method: 'POST' }),
  updateIssueFix: (id: string, payload: { corrected_code?: string; suggested_fix?: string }) => request<Issue>(`/v1/issues/${id}/update-fix`, { method: 'POST', body: JSON.stringify(payload) }),
  applySuggestion: (id: string, commit_message?: string) => request<Issue>(`/v1/analysis/suggestions/${id}/apply`, { method: 'POST', body: JSON.stringify({ commit_message }) }),
  getGithubAuthorizationUrl: () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const query = origin ? `?redirect_url=${encodeURIComponent(origin)}` : '';
    return request<{ authorization_url: string }>(`/v1/github/authorize${query}`);
  },
  getGithubConnection: () => request<{ id: number; login: string; name: string | null; avatar_url: string | null; html_url: string }>('/v1/github/me'),
  listGithubRepositories: () => request<GitHubRepository[]>('/v1/github/repositories'),
  getPublicUserRepositories: (username: string) => request<GitHubRepository[]>(`/v1/github/users/${encodeURIComponent(username)}/repositories`),
  connectGithubRepository: (payload: GitHubConnectRepositoryInput) => request<{ project_id: string; repository_id: string; message: string }>('/v1/github/repositories/connect', { method: 'POST', body: JSON.stringify(payload) }),
  logout: () => request<void>('/v1/github/logout', { method: 'POST' }),
  indexRepository: (repositoryId: string) => request<{ message: string }>(`/v1/rag/${repositoryId}/index`, { method: 'POST' }),
  chatWithRepo: (repositoryId: string, query: string) => request<{ answer: string }>(`/v1/rag/${repositoryId}/chat`, { method: 'POST', body: JSON.stringify({ query }) }),
};
