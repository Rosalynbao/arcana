import random

MAJOR_ARCANA = [
    "The Fool", "The Magician", "The High Priestess", "The Empress", "The Emperor",
    "The Hierophant", "The Lovers", "The Chariot", "Strength", "The Hermit",
    "Wheel of Fortune", "Justice", "The Hanged Man", "Death", "Temperance",
    "The Devil", "The Tower", "The Star", "The Moon", "The Sun", "Judgement", "The World"
]

MINOR_ARCANA = [
    "Ace of Cups", "Two of Cups", "Three of Cups", "Four of Cups", "Five of Cups",
    "Six of Cups", "Seven of Cups", "Eight of Cups", "Nine of Cups", "Ten of Cups",
    "Page of Cups", "Knight of Cups", "Queen of Cups", "King of Cups",
    "Ace of Wands", "Two of Wands", "Three of Wands", "Four of Wands", "Five of Wands",
    "Six of Wands", "Seven of Wands", "Eight of Wands", "Nine of Wands", "Ten of Wands",
    "Page of Wands", "Knight of Wands", "Queen of Wands", "King of Wands",
    "Ace of Swords", "Two of Swords", "Three of Swords", "Four of Swords", "Five of Swords",
    "Six of Swords", "Seven of Swords", "Eight of Swords", "Nine of Swords", "Ten of Swords",
    "Page of Swords", "Knight of Swords", "Queen of Swords", "King of Swords",
    "Ace of Pentacles", "Two of Pentacles", "Three of Pentacles", "Four of Pentacles", "Five of Pentacles",
    "Six of Pentacles", "Seven of Pentacles", "Eight of Pentacles", "Nine of Pentacles", "Ten of Pentacles",
    "Page of Pentacles", "Knight of Pentacles", "Queen of Pentacles", "King of Pentacles",
]

FULL_DECK = MAJOR_ARCANA + MINOR_ARCANA  # 78 cards


def draw_cards(num_cards: int = 3) -> list[str]:
    selected = random.sample(FULL_DECK, min(num_cards, len(FULL_DECK)))
    result = []
    for card in selected:
        orientation = random.choice(["Upright", "Reversed"])
        result.append(f"{card} ({orientation})")
    return result


def get_star_color(cards: list[str]) -> str:
    suit_counts: dict[str, int] = {}
    for card in cards:
        if any(m in card for m in ["Cups"]):
            suit_counts["cups"] = suit_counts.get("cups", 0) + 1
        elif any(m in card for m in ["Wands"]):
            suit_counts["wands"] = suit_counts.get("wands", 0) + 1
        elif any(m in card for m in ["Swords"]):
            suit_counts["swords"] = suit_counts.get("swords", 0) + 1
        elif any(m in card for m in ["Pentacles"]):
            suit_counts["pentacles"] = suit_counts.get("pentacles", 0) + 1
        else:
            suit_counts["major"] = suit_counts.get("major", 0) + 1
    if not suit_counts:
        return "#b388ff"
    dominant = max(suit_counts, key=lambda k: suit_counts[k])
    return {
        "cups": "#e879a0", "wands": "#f97316",
        "swords": "#7eb3f7", "pentacles": "#86efac", "major": "#b388ff",
    }.get(dominant, "#b388ff")
