"""Add GitHubAccount model and user ownership tracking for privacy fix.

Revision ID: 20260830_add_github_account_privacy
Revises: 20260826_issue_github_commit
Create Date: 2026-08-30 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '20260830_add_github_account_privacy'
down_revision = '20260826_issue_github_commit'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create github_accounts table
    op.create_table(
        'github_accounts',
        sa.Column('id', sa.Uuid(as_uuid=True), nullable=False),
        sa.Column('github_id', sa.Integer(), nullable=False),
        sa.Column('github_login', sa.String(length=255), nullable=False),
        sa.Column('avatar_url', sa.String(length=2048), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('github_id'),
        sa.UniqueConstraint('github_login'),
    )
    op.create_index('ix_github_accounts_github_id', 'github_accounts', ['github_id'])
    op.create_index('ix_github_accounts_github_login', 'github_accounts', ['github_login'])

    # Add github_account_id to projects table
    op.add_column('projects', sa.Column('github_account_id', sa.Uuid(as_uuid=True), nullable=True))
    
    # Add github_account_id to repositories table
    op.add_column('repositories', sa.Column('github_account_id', sa.Uuid(as_uuid=True), nullable=True))
    
    # Add github_account_id to analysis_runs table
    op.add_column('analysis_runs', sa.Column('github_account_id', sa.Uuid(as_uuid=True), nullable=True))
    
    # Add github_account_id and applied_at to issues table
    op.add_column('issues', sa.Column('github_account_id', sa.Uuid(as_uuid=True), nullable=True))
    op.add_column('issues', sa.Column('applied_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    # Remove columns from issues
    op.drop_column('issues', 'applied_at')
    op.drop_column('issues', 'github_account_id')
    
    # Remove columns from analysis_runs
    op.drop_column('analysis_runs', 'github_account_id')
    
    # Remove columns from repositories
    op.drop_column('repositories', 'github_account_id')
    
    # Remove columns from projects
    op.drop_column('projects', 'github_account_id')
    
    # Drop github_accounts table
    op.drop_index('ix_github_accounts_github_login', table_name='github_accounts')
    op.drop_index('ix_github_accounts_github_id', table_name='github_accounts')
    op.drop_table('github_accounts')
