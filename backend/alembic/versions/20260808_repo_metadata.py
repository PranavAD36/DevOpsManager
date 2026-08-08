"""Add GitHub metadata to repositories.

Revision ID: 20260808_repo_metadata
Revises: 20260808_core_devops_management
Create Date: 2026-08-08
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20260808_repo_metadata"
down_revision: Union[str, None] = "20260808_core_devops_management"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    existing_columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("repositories")}
    columns = {
        "github_description": sa.Text(),
        "is_private": sa.Boolean(),
        "is_fork": sa.Boolean(),
        "language": sa.String(length=100),
        "stargazers_count": sa.Integer(),
        "forks_count": sa.Integer(),
        "open_issues_count": sa.Integer(),
        "repository_size": sa.Integer(),
        "github_created_at": sa.DateTime(timezone=True),
        "github_updated_at": sa.DateTime(timezone=True),
        "pushed_at": sa.DateTime(timezone=True),
    }
    for name, column_type in columns.items():
        if name not in existing_columns:
            op.add_column("repositories", sa.Column(name, column_type, nullable=True))


def downgrade() -> None:
    existing_columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("repositories")}
    for column in (
        "pushed_at", "github_updated_at", "github_created_at", "repository_size",
        "open_issues_count", "forks_count", "stargazers_count", "language",
        "is_fork", "is_private", "github_description",
    ):
        if column in existing_columns:
            op.drop_column("repositories", column)
