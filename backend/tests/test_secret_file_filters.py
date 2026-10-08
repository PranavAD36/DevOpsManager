from app.integrations.github_app import _is_sensitive_source_path, is_relevant_source_path


def test_repository_scanner_includes_credentials_but_excludes_git_internals() -> None:
    assert _is_sensitive_source_path(".env")
    assert _is_sensitive_source_path("config/.env.production")
    assert _is_sensitive_source_path("certs/service.pem")
    assert _is_sensitive_source_path("keys/id_ed25519")
    assert not _is_sensitive_source_path(".git/config")
    assert not _is_sensitive_source_path("node_modules/package/.env")
    assert not is_relevant_source_path(".env")
    assert is_relevant_source_path("src/app.py")
