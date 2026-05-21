from collections.abc import Iterable
from dataclasses import dataclass
from typing import Protocol
from uuid import UUID

from app.models.enums import CategoryType, TransactionType


@dataclass(frozen=True, slots=True)
class CategoryRule:
    name: str
    keywords: tuple[str, ...]
    transaction_type: TransactionType | None


class CategoryLike(Protocol):
    id: UUID
    name: str
    effective_name: str
    display_name: str | None
    type: CategoryType
    is_default: bool
    is_hidden: bool


CATEGORY_RULES: tuple[CategoryRule, ...] = (
    CategoryRule("Salary", ("salary", "payroll", "wage"), TransactionType.INCOME),
    CategoryRule("Investment", ("profit", "dividend", "investment", "mutual"), TransactionType.INCOME),
    CategoryRule("Freelance", ("freelance", "upwork", "fiverr", "client payment"), TransactionType.INCOME),
    CategoryRule("Subscriptions", ("netflix", "spotify", "youtube premium", "subscription"), TransactionType.EXPENSE),
    CategoryRule("Digital Services", ("deepseek", "google one", "hbo max", "godaddy", "openai", "google *", "g.co/helppay"), TransactionType.EXPENSE),
    CategoryRule("Fuel", ("shell", "pso", "attock", "caltex", "filling station", "petrol", "fuel"), TransactionType.EXPENSE),
    CategoryRule("Cash Withdrawal", ("cash withdrawn at atm",), TransactionType.EXPENSE),
    CategoryRule("Mobile Top-Up", ("mobile top-up", "top up purchased", "zong ", "ufone ", "telenor ", "jazz "), TransactionType.EXPENSE),
    CategoryRule("Pharmacy / Medicine", ("chemist", "pharmacy", "d watson", "dwatson", "medical", "clinic"), TransactionType.EXPENSE),
    CategoryRule("Dining / Fast Food", ("cheezious", "blanco", "restaurant", "cafe", "coffee", "burger", "pizza", "meal"), TransactionType.EXPENSE),
    CategoryRule("Groceries", ("super market", "supermarket", "superstore", "carrefour", "imtiaz", "civic mart", "mart"), TransactionType.EXPENSE),
    CategoryRule("Fines / Government", ("traffic challan", "challan", "ticket number"), TransactionType.EXPENSE),
    CategoryRule("Peer / Family Support", ("money sent to", "money received from"), None),
    CategoryRule("Transfers Out", ("outgoing fund transfer to",), TransactionType.EXPENSE),
    CategoryRule("Transfers In", ("incoming fund transfer",), TransactionType.INCOME),
    CategoryRule("Transport", ("uber", "careem", "metrobus", "railway", "transport"), TransactionType.EXPENSE),
    CategoryRule("Utilities", ("electric", "gas", "water", "internet", "wifi", "utility"), TransactionType.EXPENSE),
    CategoryRule("Health", ("hospital", "doctor"), TransactionType.EXPENSE),
    CategoryRule("Shopping", ("daraz", "amazon", "mall", "shopping"), TransactionType.EXPENSE),
    CategoryRule("Education", ("school", "college", "university", "course", "tuition"), TransactionType.EXPENSE),
    CategoryRule("Food", ("food",), TransactionType.EXPENSE),
)


def build_category_lookup(categories: Iterable[CategoryLike]) -> dict[str, CategoryLike]:
    lookup: dict[str, CategoryLike] = {}
    for category in categories:
        if category.is_hidden:
            continue

        key = category.name.strip().lower()
        current = lookup.get(key)
        if current is None or (category.is_default and not current.is_default):
            lookup[key] = category
    return lookup


def infer_category_match(
    *,
    title: str,
    note: str | None,
    transaction_type: TransactionType,
    category_lookup: dict[str, CategoryLike],
) -> tuple[UUID | None, str | None]:
    haystack = f"{title} {note or ''}".lower()

    for rule in CATEGORY_RULES:
        if rule.transaction_type is not None and transaction_type != rule.transaction_type:
            continue

        if any(keyword in haystack for keyword in rule.keywords):
            category = category_lookup.get(rule.name.lower())
            if category and (
                category.type == CategoryType.BOTH
                or (transaction_type == TransactionType.EXPENSE and category.type == CategoryType.EXPENSE)
                or (transaction_type == TransactionType.INCOME and category.type == CategoryType.INCOME)
            ):
                return category.id, category.effective_name

    return None, None
