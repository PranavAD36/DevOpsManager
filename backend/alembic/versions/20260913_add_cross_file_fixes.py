"""Add cross_file_fixes to Issue

Revision ID: 20260913_add_cross_file_fixes
Revises: 20260830_add_github_account_privacy
Create Date: 2026-09-13 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '20260913_add_cross_file_fixes'
down_revision = '20260830_add_github_account_privacy'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('issues', sa.Column('cross_file_fixes', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('issues', 'cross_file_fixes')
