"""Canonical server-side validation for geographic profile values."""
from functools import lru_cache
from typing import Optional
import geonamescache
import pycountry
import unicodedata


def _normalized(value: str) -> str:
    return "".join(
        character for character in unicodedata.normalize("NFKD", value.casefold())
        if not unicodedata.combining(character)
    )


@lru_cache(maxsize=1)
def _city_index():
    index = set()
    for city in geonamescache.GeonamesCache().get_cities().values():
        index.add((city["countrycode"].upper(), _normalized(city["name"])))
        for alternate in city.get("alternatenames", ()):
            index.add((city["countrycode"].upper(), _normalized(alternate)))
    return index


def _country(value: str):
    try:
        return pycountry.countries.lookup(value)
    except LookupError:
        try:
            return pycountry.countries.search_fuzzy(value)[0]
        except LookupError:
            return None


def validate_location(country_name: Optional[str], state_name: Optional[str], city_name: Optional[str]) -> None:
    if not country_name:
        if state_name or city_name:
            raise ValueError("Select a country before selecting a state or city.")
        return
    country = _country(country_name)
    if not country:
        raise ValueError("Select a recognized country.")
    if state_name:
        subdivisions = pycountry.subdivisions.get(country_code=country.alpha_2)
        if not any(_normalized(item.name) == _normalized(state_name) for item in subdivisions):
            raise ValueError(f"Select a recognized state or region in {country_name}.")
    if city_name and (country.alpha_2, _normalized(city_name)) not in _city_index():
        raise ValueError(f"Select a recognized city in {country_name}.")
