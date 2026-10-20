"""User-facing wording shared by the app, the CLI and the README."""

APP_NAME = "AI Text Detector"

LIMITATIONS = """\
AI detection is probabilistic. This tool estimates how much a text resembles \
AI-generated writing; it cannot prove who or what wrote it.

- Never use this result as the only basis for accusing anyone. A "Likely \
AI-generated" verdict is a reason to ask questions, not evidence.
- It makes mistakes in both directions. It wrongly flags some human writing, \
and it misses AI text, especially AI text that a person has edited or reworded.
- Some writing is flagged more often than it should be: formal, technical or \
template-like writing, very short texts, and writing by people using English \
as a second language.
- It was trained on texts from AI models released up to 2024. Newer models \
can write differently and may be missed.
- It only works for English prose. Code, lists, poetry, heavy quotation and \
other languages give unreliable results.
- A "Likely human-written" verdict does not prove a person wrote the text.
"""

PRIVACY = (
    "Your text never leaves your computer. All analysis runs offline; the only "
    "network access is an optional check for new versions, which sends no text."
)

HOW_IT_WORKS = """\
The detector combines two kinds of evidence. A statistical model of word and \
character patterns compares the text with thousands of human-written and \
AI-written examples, and about thirty writing-style measurements look at \
things like how much sentence length varies, vocabulary variety, punctuation \
and stock phrases. A final model weighs the evidence, and a calibration step \
turns it into a probability with a range that is wider when the text is unlike \
anything the detector was tested on.

The sentence colours show which parts of this text look more AI-like than the \
rest of it. They are relative and much less reliable than the overall result.
"""
