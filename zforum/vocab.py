"""The one home of every closed vocabulary zforum uses: signal ids, tones, claim kinds and
statuses, factual assessments, quiz question kinds. Schemas, prompts, validators and the
site all import or receive these from here; none restates its own copy."""

from dataclasses import dataclass
from enum import Enum


class SignalSource(Enum):
    DETERMINISTIC = "deterministic"  # computed from text and thread structure, no model
    METADATA = "metadata"  # read from Discourse's own fields
    MODEL = "model"  # emitted by a model task, always with a verbatim quoted span
    DERIVED = "derived"  # computed deterministically from a model task's claim graph


class SignalPolarity(Enum):
    CAUTION = "caution"
    POSITIVE = "positive"
    DISCLOSURE = "disclosure"


@dataclass(frozen=True, slots=True)
class SignalDefinition:
    id: str
    name: str
    category: str
    source: SignalSource
    polarity: SignalPolarity
    description: str


SIGNALS: tuple[SignalDefinition, ...] = (
    SignalDefinition("A1", "one-sided case", "argument", SignalSource.MODEL, SignalPolarity.CAUTION,
                     "Argues for a position with no acknowledged cost and no engagement with the strongest objection."),
    SignalDefinition("A2", "unsourced number", "argument", SignalSource.DETERMINISTIC, SignalPolarity.CAUTION,
                     "A reply states a percentage, currency amount or large quantity in a paragraph that carries no link."),
    SignalDefinition("A3", "strawman", "argument", SignalSource.MODEL, SignalPolarity.CAUTION,
                     "Restates an opposing view in a form its holders do not hold, or extends it to an absurd conclusion."),
    SignalDefinition("A4", "motive attribution", "argument", SignalSource.MODEL, SignalPolarity.CAUTION,
                     "Explains a position by the hidden motives of the person holding it, in a way no evidence could settle."),
    SignalDefinition("A5", "already answered", "argument", SignalSource.DERIVED, SignalPolarity.CAUTION,
                     "Asserts a claim that an earlier post in the thread already rebutted."),
    SignalDefinition("A6", "goalpost shift", "argument", SignalSource.MODEL, SignalPolarity.CAUTION,
                     "Answers a different question than the one asked, or relocates a claim after being asked for support."),
    SignalDefinition("B1", "affiliation attack", "conduct", SignalSource.MODEL, SignalPolarity.CAUTION,
                     "Dismisses an argument because of who made it or whom they work for."),
    SignalDefinition("B2", "name-calling", "conduct", SignalSource.MODEL, SignalPolarity.CAUTION,
                     "Labels a person or group with an insult or othering term."),
    SignalDefinition("B3", "contempt", "conduct", SignalSource.MODEL, SignalPolarity.CAUTION,
                     "Sarcasm, mockery, shouting or contempt directed at an interlocutor."),
    SignalDefinition("B4", "group bad faith", "conduct", SignalSource.MODEL, SignalPolarity.CAUTION,
                     "Ascribes bad faith to a whole group."),
    SignalDefinition("C1", "contentless agreement", "low-information", SignalSource.DETERMINISTIC, SignalPolarity.CAUTION,
                     "A short reply whose content is agreement, with no question, number or link."),
    SignalDefinition("C2", "consecutive run", "low-information", SignalSource.DETERMINISTIC, SignalPolarity.CAUTION,
                     "Follows the same author's previous post with no one else posting in between."),
    SignalDefinition("C3", "volume share", "low-information", SignalSource.DETERMINISTIC, SignalPolarity.CAUTION,
                     "One author wrote a large share of the thread. Display only: it never folds or hides a post."),
    SignalDefinition("C4", "wall of text", "low-information", SignalSource.DETERMINISTIC, SignalPolarity.CAUTION,
                     "Over 6,000 characters with no headings and no lists."),
    SignalDefinition("D1", "stated affiliation", "disclosure", SignalSource.METADATA, SignalPolarity.DISCLOSURE,
                     "The author's title or primary group as the forum records it."),
    SignalDefinition("D2", "self-disclosure", "disclosure", SignalSource.MODEL, SignalPolarity.DISCLOSURE,
                     "The author states an interest, role or affiliation in the post itself."),
    SignalDefinition("D3", "alleged interest", "disclosure", SignalSource.MODEL, SignalPolarity.DISCLOSURE,
                     "Someone alleges another participant has an undisclosed interest. Contested, never a fact."),
    SignalDefinition("E1", "asks for evidence", "positive", SignalSource.MODEL, SignalPolarity.POSITIVE,
                     "Asks for a specific source, number or example."),
    SignalDefinition("E2", "de-escalation", "positive", SignalSource.MODEL, SignalPolarity.POSITIVE,
                     "Explicitly lowers the temperature or separates the argument from the people."),
    SignalDefinition("E3", "mind change", "positive", SignalSource.MODEL, SignalPolarity.POSITIVE,
                     "Concedes a point or says their view changed."),
    SignalDefinition("E4", "steelman", "positive", SignalSource.MODEL, SignalPolarity.POSITIVE,
                     "States the opposing case fairly or concedes its goals before objecting."),
    SignalDefinition("E5", "cited correction", "positive", SignalSource.MODEL, SignalPolarity.POSITIVE,
                     "Corrects a claim and points to where the correction can be checked."),
)

SIGNALS_BY_ID: dict[str, SignalDefinition] = {signal.id: signal for signal in SIGNALS}
MODEL_SIGNAL_IDS: tuple[str, ...] = tuple(signal.id for signal in SIGNALS if signal.source is SignalSource.MODEL)

# Ordered calmest first.
TONES: tuple[str, ...] = ("calm", "warm", "heated", "hostile")

CLAIM_KINDS: tuple[str, ...] = ("factual", "normative", "predictive", "interpretive")

# unanswered: nobody has responded to it. contested: rebutted, and the asserters have not
# conceded. conceded: an asserter conceded it in-thread. supported: others confirmed it
# with evidence and nobody rebutted it.
CLAIM_STATUSES: tuple[str, ...] = ("unanswered", "contested", "conceded", "supported")

# check_draft judges facts only against the thread (D-25), never on world knowledge.
FACTUAL_ASSESSMENTS: tuple[str, ...] = ("contradicted-in-thread", "supported-in-thread", "unsourced")

# The conduct and argument signals check_draft reports on a draft. Positive and disclosure
# signals are not findings about a draft.
CHECK_DRAFT_SIGNAL_IDS: tuple[str, ...] = ("A1", "A3", "A4", "A6", "B1", "B2", "B3", "B4")

QUIZ_KINDS: tuple[str, ...] = ("position", "rebuttal", "evidence", "status", "mind-change", "strongest-case")

# The Calm lens folds posts carrying these signals, unless the post is the first appearance
# of a claim or carries a positive signal: novelty and good faith are never folded.
CALM_FOLD_SIGNAL_IDS: tuple[str, ...] = ("B1", "B2", "B3", "B4", "C1", "C2")

# C3 nudge: shown when one author wrote at least this share of a thread with at least this
# many visible posts.
VOLUME_NUDGE_SHARE = 0.15
VOLUME_NUDGE_MIN_POSTS = 20
