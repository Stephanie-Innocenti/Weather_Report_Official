"""Utility per selezionare i livelli da etichettare sulle mappe."""


def label_levels(levels, every=None) -> list:
    """Livelli da etichettare: tutti, oppure solo i multipli di `every` (es. ogni 6 gradi)."""
    if not every:
        return list(levels)
    return [v for v in levels if abs(v / every - round(v / every)) < 1e-9]
