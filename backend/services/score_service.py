from sqlalchemy.orm import Session
import models
from typing import Tuple


def calculate_score(session_id: int, db: Session) -> Tuple[int, int, float]:
    answers = db.query(models.Answer).filter(models.Answer.session_id == session_id).all()

    score = 0
    total = 0
    for answer in answers:
        question = db.query(models.Question).filter(models.Question.id == answer.question_id).first()
        if question:
            total += question.marks
            if answer.is_correct:
                score += question.marks

    percentage = (score / total * 100) if total > 0 else 0.0
    return score, total, round(percentage, 2)
