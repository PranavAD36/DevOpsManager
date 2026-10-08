"""Persist GitHub Actions run history for engineering analytics."""

from alembic import op
import sqlalchemy as sa


revision = "20261009_workflow_runs"
down_revision = "20261008_engineering_alerts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "workflow_runs",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("github_account_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("repository_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("github_run_id", sa.BigInteger(), nullable=False),
        sa.Column("workflow_name", sa.String(length=500), nullable=False),
        sa.Column("branch", sa.String(length=255), nullable=True),
        sa.Column("commit_sha", sa.String(length=64), nullable=True),
        sa.Column("actor", sa.String(length=255), nullable=True),
        sa.Column("status", sa.String(length=50), nullable=False),
        sa.Column("conclusion", sa.String(length=50), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
        sa.Column("html_url", sa.String(length=2048), nullable=False, server_default=""),
        sa.ForeignKeyConstraint(["github_account_id"], ["github_accounts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["repository_id"], ["repositories.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "repository_id",
            "github_run_id",
            name="uq_workflow_runs_repository_github_id",
        ),
    )
    op.create_index(
        "ix_workflow_runs_owner_created",
        "workflow_runs",
        ["github_account_id", "created_at"],
    )
    op.create_index(
        "ix_workflow_runs_repository_conclusion",
        "workflow_runs",
        ["repository_id", "conclusion"],
    )


def downgrade() -> None:
    op.drop_index("ix_workflow_runs_repository_conclusion", table_name="workflow_runs")
    op.drop_index("ix_workflow_runs_owner_created", table_name="workflow_runs")
    op.drop_table("workflow_runs")
