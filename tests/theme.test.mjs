import assert from "node:assert/strict";
import test from "node:test";
import { themeControl } from "../site/js/theme.js";
import { installDom, RecordedNode, click, findId } from "./recorded-dom.mjs";

function setup(t, value, dark, readProblem, writeProblem = null) {
  installDom(t);
  const root = new RecordedNode("html");
  const media = new EventTarget();
  media.matches = dark;
  const writes = [];
  const control = themeControl(root, media, key => {
    assert.equal(key, "zforum.theme.v1");
    return { value, problem: readProblem };
  }, (key, choice) => { writes.push([key, choice]); return writeProblem; });
  return { root, media, control, writes, button: findId(control, "theme-toggle") };
}

for (const dark of [false, true]) {
  for (const saved of [null, "light", "dark"]) {
    test(`theme follows system=${dark}, saved=${saved}, then explicit choices persist`, t => {
      const { root, media, button, writes } = setup(t, saved, dark);
      const initial = saved ?? (dark ? "dark" : "light");
      assert.equal(root.attributes.get("data-theme"), initial);
      assert.deepEqual(writes, []);
      media.matches = !dark;
      media.dispatchEvent(new Event("change"));
      let current = saved ?? (!dark ? "dark" : "light");
      assert.equal(root.attributes.get("data-theme"), current);
      for (let i = 0; i < 6; i++) {
        const next = current === "dark" ? "light" : "dark";
        assert.equal(button.attributes.get("aria-label"), `Switch to ${next} mode`);
        assert.equal(button.attributes.get("title"), `Switch to ${next} mode`);
        assert.equal(button.textContent, next === "light" ? "☀" : "☾");
        assert.equal(button.children[0].attributes.get("aria-hidden"), "true");
        button.focus();
        click(button);
        assert.equal(document.activeElement, button);
        assert.equal(root.attributes.get("data-theme"), next);
        assert.deepEqual(writes.at(-1), ["zforum.theme.v1", next]);
        media.matches = !media.matches;
        media.dispatchEvent(new Event("change"));
        assert.equal(root.attributes.get("data-theme"), next);
        current = next;
      }
    });
  }
}

test("invalid saved theme is reported and a new selection repairs the preference", t => {
  const { root, control, button } = setup(t, "sepia", true);
  const notice = control.children[1];
  assert.equal(root.attributes.get("data-theme"), "dark");
  assert.equal(notice.textContent, 'Saved theme "sepia" is invalid. Using the system theme.');
  assert.equal(notice.hidden, false);
  click(button);
  assert.equal(notice.hidden, true);
  assert.equal(notice.textContent, "");
});

test("storage failures are visible while switching remains usable for the session", t => {
  const { root, control, button } = setup(t, null, false, "Reading storage denied", "Writing storage denied");
  const notice = control.children[1];
  assert.equal(notice.textContent, "Reading storage denied");
  click(button);
  assert.equal(root.attributes.get("data-theme"), "dark");
  assert.equal(notice.textContent, "Writing storage denied");
  assert.equal(notice.hidden, false);
});
