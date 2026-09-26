"""add fingerprint column and fix github_account constraints

Revision ID: e6f15727a76d
Revises: 20260913_add_cross_file_fixes
Create Date: 2026-09-26 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e6f15727a76d"
down_revision: Union[str, None] = "20260913_add_cross_file_fixes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add missing fingerprint column to issues
    op.add_column("issues", sa.Column("fingerprint", sa.String(length=64), nullable=True))
    op.create_index("ix_issues_fingerprint", "issues", ["fingerprint"])

    # Fix github_account_id: make NOT NULL, add FKs and indexes
    for table in ("projects", "repositories", "analysis_runs", "issues"):
        op.alter_column(table, "github_account_id", existing_type=sa.Uuid(), nullable=False)
        op.create_foreign_key(
            f"fk_{table}_github_account_id",
            table,
            "github_accounts",
            ["github_account_id"],
            ["id"],
            ondelete="CASCADE",
        )
        op.create_index(f"ix_{table}_github_account_id", table, ["github_account_id"])


def downgrade() -> None:
    for table in ("issues", "analysis_runs", "repositories", "projects"):
        op.drop_index(f"ix_{table}_github_account_id", table_name=table)
        op.drop_constraint(f"fk_{table}_github_account_id", table, type_="foreignkey")
        op.alter_column(table, "github_account_id", existing_type=sa.Uuid(), nullable=True)

    op.drop_index("ix_issues_fingerprint", table_name="issues")
    op.drop_column("issues", "fingerprint")
