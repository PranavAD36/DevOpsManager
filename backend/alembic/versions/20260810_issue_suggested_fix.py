"""Add suggested_fix and corrected_code to issues table.

Revision ID: 20260810_issue_suggested_fix
Revises: 20260809_github_connections
Create Date: 2026-08-10
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260810_issue_suggested_fix"
down_revision: Union[str, None] = "20260809_github_connections"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("issues", sa.Column("suggested_fix", sa.Text(), nullable=True))
    op.add_column("issues", sa.Column("corrected_code", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("issues", "corrected_code")
    op.drop_column("issues", "suggested_fix")
