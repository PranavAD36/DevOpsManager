"""Add server-side GitHub App connections.

Revision ID: 20260809_github_connections
Revises: 20260808_repo_metadata
Create Date: 2026-08-09
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "20260809_github_connections"
down_revision: Union[str, None] = "20260808_repo_metadata"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "github_connections",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("github_user_id", sa.Integer(), nullable=False),
        sa.Column("github_login", sa.String(length=255), nullable=False),
        sa.Column("access_token", sa.Text(), nullable=False),
        sa.Column("token_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("github_user_id", name="uq_github_connections_user_id"),
    )
    op.create_index("ix_github_connections_github_user_id", "github_connections", ["github_user_id"])


def downgrade() -> None:
    op.drop_index("ix_github_connections_github_user_id", table_name="github_connections")
    op.drop_table("github_connections")
