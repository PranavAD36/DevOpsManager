"""store approved GitHub commit metadata"""
from alembic import op
import sqlalchemy as sa

revision = "20260826_issue_github_commit"
down_revision = "20260810_issue_approved_at"
branch_labels = None
depends_on = None

def upgrade():
    op.add_column("issues", sa.Column("original_content", sa.Text(), nullable=True))
    op.add_column("issues", sa.Column("original_sha", sa.String(64), nullable=True))
    op.add_column("issues", sa.Column("commit_sha", sa.String(64), nullable=True))
    op.add_column("issues", sa.Column("commit_message", sa.String(500), nullable=True))
    op.add_column("issues", sa.Column("commit_url", sa.String(2048), nullable=True))

def downgrade():
    for name in ("commit_url", "commit_message", "commit_sha", "original_sha", "original_content"):
        op.drop_column("issues", name)
