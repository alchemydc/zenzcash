import pytest

from tests.factories import latest_json, latest_topic_json, post_json, topic_json
from zforum.discourse import (
    AuthorMetadata,
    Category,
    DiscourseFormatError,
    HiddenByCommunity,
    PostKind,
    VisibleText,
    parse_categories_response,
    parse_latest_response,
    parse_posts_response,
    parse_topic_response,
)
from zforum.domain import CategoryId, PostId, PostNumber, TopicId, Username, UtcTimestamp


def test_visible_post_parses_every_consumed_field() -> None:
    document = {"post_stream": {"posts": [post_json(7, 3, raw="Some **text**", reply_to=2, user_title="Zcash Foundation", primary_group_name="ZF")]}}
    (post,) = parse_posts_response(document, "batch")
    assert post.id == PostId(7)
    assert post.topic_id == TopicId(100)
    assert post.number == PostNumber(3)
    assert post.author == Username("alice")
    assert post.author_name is None
    assert post.created_at == UtcTimestamp.parse_discourse("2026-10-20T10:00:00.000Z")
    assert post.kind is PostKind.REGULAR
    assert post.reply_to == PostNumber(2)
    assert post.body == VisibleText("Some **text**")
    assert post.author_metadata == AuthorMetadata(user_title="Zcash Foundation", primary_group="ZF", trust_level=1, staff=False)


def test_hidden_post_carries_no_text() -> None:
    (post,) = parse_posts_response({"post_stream": {"posts": [post_json(7, 3, raw=None, hidden=True)]}}, "batch")
    assert post.body == HiddenByCommunity()


@pytest.mark.parametrize("post_type,kind", [(1, PostKind.REGULAR), (2, PostKind.MODERATOR_ACTION), (3, PostKind.SMALL_ACTION)])
def test_known_post_types(post_type: int, kind: PostKind) -> None:
    (post,) = parse_posts_response({"post_stream": {"posts": [post_json(7, 3, post_type=post_type)]}}, "batch")
    assert post.kind is kind


def test_whisper_post_type_is_rejected() -> None:
    with pytest.raises(DiscourseFormatError, match=r"^batch: post id 7: unknown post_type 4$"):
        parse_posts_response({"post_stream": {"posts": [post_json(7, 3, post_type=4)]}}, "batch")


@pytest.mark.parametrize("hidden,raw,label", [(True, "leaked text", "present"), (False, None, "absent")])
def test_hidden_and_raw_must_agree(hidden: bool, raw: str | None, label: str) -> None:
    with pytest.raises(DiscourseFormatError, match=rf"^batch: post id 7: hidden={hidden} with raw {label}$"):
        parse_posts_response({"post_stream": {"posts": [post_json(7, 3, raw=raw, hidden=hidden)]}}, "batch")


def test_empty_strings_mean_unset() -> None:
    document = {"post_stream": {"posts": [post_json(7, 3, user_title="", primary_group_name="")]}}
    (post,) = parse_posts_response(document, "batch")
    assert post.author_metadata.user_title is None
    assert post.author_metadata.primary_group is None


def test_missing_consumed_field_is_rejected_with_path() -> None:
    item = post_json(7, 3)
    del item["trust_level"]
    with pytest.raises(DiscourseFormatError, match=r"^batch: at post_stream/posts/0: 'trust_level' is a required property$"):
        parse_posts_response({"post_stream": {"posts": [item]}}, "batch")


def test_null_raw_is_rejected() -> None:
    item = post_json(7, 3)
    item["raw"] = None
    with pytest.raises(DiscourseFormatError, match=r"^batch: at post_stream/posts/0/raw: None is not of type 'string'$"):
        parse_posts_response({"post_stream": {"posts": [item]}}, "batch")


def test_deleted_post_visible_to_anonymous_is_rejected() -> None:
    item = post_json(7, 3)
    item["deleted_at"] = "2026-10-20T10:00:00.000Z"
    with pytest.raises(DiscourseFormatError, match=r"^batch: at post_stream/posts/0/deleted_at: '2026-10-20T10:00:00.000Z' is not of type 'null'$"):
        parse_posts_response({"post_stream": {"posts": [item]}}, "batch")


def test_invalid_username_is_reported_with_post_id() -> None:
    with pytest.raises(DiscourseFormatError, match=r"^batch: post id 7: invalid Discourse username 'bad name'$"):
        parse_posts_response({"post_stream": {"posts": [post_json(7, 3, username="bad name")]}}, "batch")


def test_topic_response() -> None:
    head = parse_topic_response(topic_json(100, [7, 8, 9], [post_json(7, 1)]), "topic")
    assert head.id == TopicId(100)
    assert head.title == "A topic"
    assert head.category == CategoryId(25)
    assert head.stream == (PostId(7), PostId(8), PostId(9))
    assert [post.id for post in head.first_posts] == [PostId(7)]


def test_topic_response_rejects_foreign_post() -> None:
    with pytest.raises(DiscourseFormatError, match=r"^topic: post 7 belongs to topic 999, not 100$"):
        parse_topic_response(topic_json(100, [7], [post_json(7, 1, topic_id=999)]), "topic")


def test_topic_response_rejects_duplicate_stream_ids() -> None:
    with pytest.raises(DiscourseFormatError, match=r"^topic: post_stream.stream contains duplicate ids$"):
        parse_topic_response(topic_json(100, [7, 7], [post_json(7, 1)]), "topic")


def test_latest_response() -> None:
    page = parse_latest_response(latest_json([latest_topic_json(5, "2026-10-30T00:00:00.000Z", pinned=True)], has_more=True), "latest")
    assert page.has_more is True
    (topic,) = page.topics
    assert topic.id == TopicId(5)
    assert topic.pinned is True
    assert topic.bumped_at == UtcTimestamp.parse_discourse("2026-10-30T00:00:00.000Z")
    assert parse_latest_response(latest_json([], has_more=False), "latest").has_more is False


def test_categories_response_flattens_subcategories() -> None:
    document = {
        "category_list": {
            "categories": [
                {"id": 25, "name": "Governance", "slug": "governance", "subcategory_list": [{"id": 38, "name": "ZCG Elections", "slug": "zcg-elections"}]},
                {"id": 41, "name": "Off Topic Lounge", "slug": "off-topic"},
            ]
        }
    }
    assert parse_categories_response(document, "cats") == (
        Category(CategoryId(25), "Governance", "governance", None),
        Category(CategoryId(38), "ZCG Elections", "zcg-elections", CategoryId(25)),
        Category(CategoryId(41), "Off Topic Lounge", "off-topic", None),
    )


def test_categories_response_rejects_duplicate_ids() -> None:
    document = {"category_list": {"categories": [{"id": 1, "name": "A", "slug": "a"}, {"id": 1, "name": "B", "slug": "b"}]}}
    with pytest.raises(DiscourseFormatError, match=r"^cats: duplicate category ids$"):
        parse_categories_response(document, "cats")
