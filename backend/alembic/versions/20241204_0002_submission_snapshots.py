"""submission snapshots

Revision ID: 20241204_0002
Revises: 20241204_0001
Create Date: 2024-12-04 00:30:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20241204_0002"
down_revision = "20241204_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("submissions", sa.Column("submitter_name", sa.String(length=255), nullable=True))
    op.add_column("submissions", sa.Column("problem_title_snapshot", sa.Text(), nullable=True))
    op.add_column("submissions", sa.Column("problem_description_snapshot", sa.Text(), nullable=True))
    op.add_column("submissions", sa.Column("example_input_snapshot", sa.Text(), nullable=True))
    op.add_column("submissions", sa.Column("example_output_snapshot", sa.Text(), nullable=True))
    op.add_column(
        "submissions",
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "submissions",
        sa.Column("latest_execution_result_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_submissions_latest_execution_results",
        "submissions",
        "execution_results",
        ["latest_execution_result_id"],
        ["id"],
    )

    op.create_table(
        "submission_test_case_snapshots",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column(
            "submission_id",
            sa.Integer(),
            sa.ForeignKey("submissions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("input_data", sa.Text(), nullable=False),
        sa.Column("expected_output", sa.Text(), nullable=False),
        sa.Column("is_hidden", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_table("submission_test_case_snapshots")
    op.drop_constraint("fk_submissions_latest_execution_results", "submissions", type_="foreignkey")
    op.drop_column("submissions", "latest_execution_result_id")
    op.drop_column("submissions", "submitted_at")
    op.drop_column("submissions", "example_output_snapshot")
    op.drop_column("submissions", "example_input_snapshot")
    op.drop_column("submissions", "problem_description_snapshot")
    op.drop_column("submissions", "problem_title_snapshot")
    op.drop_column("submissions", "submitter_name")

