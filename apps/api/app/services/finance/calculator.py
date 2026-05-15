def affordability_ratio(available_cash: float, planned_spend: float) -> float:
    if planned_spend <= 0:
        return 1.0
    return available_cash / planned_spend

