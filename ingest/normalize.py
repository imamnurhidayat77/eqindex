"""Shared normalization helpers for EQIndex ingestion (Step 2).

Deterministic rules — the SAME function must be used by every importer
(CSV now, FEI/Equipe scrapers in Step 3) so horse/rider identity stays stable.
"""
import re
import unicodedata


def normalize_name(raw: str) -> str:
    """'  Count-Contend ' -> 'COUNT CONTEND' (accents stripped, punctuation dropped)."""
    if raw is None:
        return ""
    s = unicodedata.normalize("NFKD", raw.strip().upper())
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = re.sub(r"[^A-Z0-9 ]", "", s)
    return re.sub(r"\s+", " ", s).strip()


def slug(raw: str) -> str:
    """'CSI1*-W 140cm Jump Off' -> 'csi1-w-140cm-jump-off' (stable external IDs for CSV)."""
    s = normalize_name(raw).lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return re.sub(r"-{2,}", "-", s)
