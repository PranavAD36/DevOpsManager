"""Add owner-scoped, deduplicated engineering alerts."""

from alembic import op
import sqlalchemy as sa


revision = "20261008_engineering_alerts"
down_revision = "e6f15727a76d"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "engineering_alerts",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("github_account_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("repository_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("source", sa.String(length=100), nullable=False),
        sa.Column("fingerprint", sa.String(length=64), nullable=False),
        sa.Column("severity", sa.String(length=50), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("status", sa.String(length=50), nullable=False, server_default="open"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["github_account_id"], ["github_accounts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["repository_id"], ["repositories.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "github_account_id",
            "fingerprint",
            name="uq_engineering_alerts_owner_fingerprint",
        ),
    )
    op.create_index(
        "ix_engineering_alerts_owner_status",
        "engineering_alerts",
        ["github_account_id", "status"],
    )
    op.create_index("ix_engineering_alerts_created_at", "engineering_alerts", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_engineering_alerts_created_at", table_name="engineering_alerts")
    op.drop_index("ix_engineering_alerts_owner_status", table_name="engineering_alerts")
    op.drop_table("engineering_alerts")
