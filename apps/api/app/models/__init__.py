def register_models() -> None:
    from app.models.ai_advice_log import AIAdviceLog  # noqa: F401
    from app.models.category import Category  # noqa: F401
    from app.models.import_batch import ImportBatch  # noqa: F401
    from app.models.password_reset_token import PasswordResetToken  # noqa: F401
    from app.models.savings_goal import SavingsGoal  # noqa: F401
    from app.models.transaction import Transaction  # noqa: F401
    from app.models.user_category_setting import UserCategorySetting  # noqa: F401
    from app.models.user import User  # noqa: F401
    from app.models.user_session import UserSession  # noqa: F401
    from app.models.user_preference import UserPreference  # noqa: F401
