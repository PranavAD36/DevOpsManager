"""Add approved_at column to issues table.

Revision ID: 20260810_issue_approved_at
Revises: 20260810_issue_suggested_fix
Create Date: 2026-08-10
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260810_issue_approved_at"
down_revision: Union[str, None] = "20260810_issue_suggested_fix"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("issues", sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("issues", "approved_at")
