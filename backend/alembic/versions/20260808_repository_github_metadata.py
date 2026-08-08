"""Add GitHub metadata to repositories.

Revision ID: 20260808_repository_github_metadata
Revises: 20260808_core_devops_management
Create Date: 2026-08-08
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20260808_repository_github_metadata"
down_revision: Union[str, None] = "20260808_core_devops_management"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("repositories", sa.Column("github_description", sa.Text(), nullable=True))
    op.add_column("repositories", sa.Column("is_private", sa.Boolean(), nullable=True))
    op.add_column("repositories", sa.Column("is_fork", sa.Boolean(), nullable=True))
    op.add_column("repositories", sa.Column("language", sa.String(length=100), nullable=True))
    op.add_column("repositories", sa.Column("stargazers_count", sa.Integer(), nullable=True))
    op.add_column("repositories", sa.Column("forks_count", sa.Integer(), nullable=True))
    op.add_column("repositories", sa.Column("open_issues_count", sa.Integer(), nullable=True))
    op.add_column("repositories", sa.Column("repository_size", sa.Integer(), nullable=True))
    op.add_column("repositories", sa.Column("github_created_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("repositories", sa.Column("github_updated_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("repositories", sa.Column("pushed_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    for column in (
        "pushed_at", "github_updated_at", "github_created_at", "repository_size",
        "open_issues_count", "forks_count", "stargazers_count", "language",
        "is_fork", "is_private", "github_description",
    ):
        op.drop_column("repositories", column)
