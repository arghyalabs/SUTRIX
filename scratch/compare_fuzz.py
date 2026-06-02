import os
import sys
from rapidfuzz import fuzz
import difflib

col_name = "author"
alias = "earthworm"

print("rapidfuzz token_set_ratio:", fuzz.token_set_ratio(col_name, alias) / 100.0)
print("rapidfuzz ratio:", fuzz.ratio(col_name, alias) / 100.0)
print("difflib ratio:", difflib.SequenceMatcher(None, col_name, alias).ratio())

col_name_2 = "year"
alias_2 = "yeast"
print("\nyear vs yeast:")
print("rapidfuzz token_set_ratio:", fuzz.token_set_ratio(col_name_2, alias_2) / 100.0)
print("difflib ratio:", difflib.SequenceMatcher(None, col_name_2, alias_2).ratio())

col_name_3 = "route"
alias_3 = "trout"
print("\nroute vs trout:")
print("rapidfuzz token_set_ratio:", fuzz.token_set_ratio(col_name_3, alias_3) / 100.0)
print("difflib ratio:", difflib.SequenceMatcher(None, col_name_3, alias_3).ratio())
