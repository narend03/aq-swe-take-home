from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class User(Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    display_name: Mapped[Optional[str]] = mapped_column(String(255))

    problems: Mapped[List["Problem"]] = relationship(back_populates="author")
    submissions: Mapped[List["Submission"]] = relationship(back_populates="author")
    reviews: Mapped[List["Review"]] = relationship(back_populates="reviewer")


class Problem(Base):
    __tablename__ = "problems"

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    example_input: Mapped[str] = mapped_column(Text, nullable=False)
    example_output: Mapped[str] = mapped_column(Text, nullable=False)
    author_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)

    author: Mapped[Optional[User]] = relationship(back_populates="problems")
    test_cases: Mapped[List["TestCase"]] = relationship(
        back_populates="problem", cascade="all, delete-orphan", order_by="TestCase.id"
    )
    submissions: Mapped[List["Submission"]] = relationship(back_populates="problem")


class TestCase(Base):
    __tablename__ = "test_cases"

    problem_id: Mapped[int] = mapped_column(ForeignKey("problems.id", ondelete="CASCADE"))
    input_data: Mapped[str] = mapped_column(Text, nullable=False)
    expected_output: Mapped[str] = mapped_column(Text, nullable=False)
    is_hidden: Mapped[bool] = mapped_column(Boolean, default=False)

    problem: Mapped[Problem] = relationship(back_populates="test_cases")


class Submission(Base):
    __tablename__ = "submissions"

    problem_id: Mapped[int] = mapped_column(ForeignKey("problems.id", ondelete="CASCADE"))
    author_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    code: Mapped[str] = mapped_column(Text, nullable=False)
    language: Mapped[str] = mapped_column(String(32), default="python")

    problem: Mapped[Problem] = relationship(back_populates="submissions")
    author: Mapped[Optional[User]] = relationship(back_populates="submissions")
    execution_results: Mapped[List["ExecutionResult"]] = relationship(
        back_populates="submission", cascade="all, delete-orphan"
    )
    review: Mapped[Optional["Review"]] = relationship(back_populates="submission", uselist=False)


class ExecutionResult(Base):
    __tablename__ = "execution_results"

    submission_id: Mapped[int] = mapped_column(ForeignKey("submissions.id", ondelete="CASCADE"))
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    passed_count: Mapped[int] = mapped_column(default=0)
    failed_count: Mapped[int] = mapped_column(default=0)
    stdout: Mapped[Optional[str]] = mapped_column(Text)
    stderr: Mapped[Optional[str]] = mapped_column(Text)
    runtime_ms: Mapped[Optional[int]] = mapped_column()
    run_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    submission: Mapped[Submission] = relationship(back_populates="execution_results")


class Review(Base):
    __tablename__ = "reviews"

    submission_id: Mapped[int] = mapped_column(
        ForeignKey("submissions.id", ondelete="CASCADE"), unique=True
    )
    reviewer_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending")
    feedback: Mapped[Optional[str]] = mapped_column(Text)

    submission: Mapped[Submission] = relationship(back_populates="review")
    reviewer: Mapped[Optional[User]] = relationship(back_populates="reviews")
