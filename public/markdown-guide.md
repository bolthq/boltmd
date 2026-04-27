# 📖 Markdown Quick Guide

> Everything you need to write beautiful documents in BoltMD.

---

## Headings

Use `#` symbols to create headings. More `#` = smaller heading.

```markdown
# Heading 1
## Heading 2
### Heading 3
#### Heading 4
```

# Heading 1
## Heading 2
### Heading 3
#### Heading 4

---

## Text Formatting

```markdown
**Bold text**
*Italic text*
~~Strikethrough~~
**_Bold and italic_**
`Inline code`
```

**Bold text** · *Italic text* · ~~Strikethrough~~ · **_Bold and italic_** · `Inline code`

---

## Links & Images

```markdown
[Visit GitHub](https://github.com)
![Alt text](image.png)
```

[Visit GitHub](https://github.com) — Click to open in your browser.

> 💡 **Tip:** Paste an image from your clipboard directly into BoltMD!

---

## Lists

### Unordered List

```markdown
- First item
- Second item
  - Nested item
  - Another nested item
- Third item
```

- First item
- Second item
  - Nested item
  - Another nested item
- Third item

### Ordered List

```markdown
1. Step one
2. Step two
3. Step three
```

1. Step one
2. Step two
3. Step three

### Task List

```markdown
- [x] Write the code
- [x] Design the icon
- [ ] Ship it 🚀
```

- [x] Write the code
- [x] Design the icon
- [ ] Ship it 🚀

---

## Blockquotes

```markdown
> "Simplicity is the ultimate sophistication."
> — Leonardo da Vinci
```

> "Simplicity is the ultimate sophistication."
> — Leonardo da Vinci

Nest them for layered quotes:

> First level
>> Second level
>>> Third level

---

## Code

### Inline Code

Use backticks for `inline code` within a sentence.

### Code Blocks

Use triple backticks with an optional language tag:

````markdown
```javascript
function hello() {
  console.log("Hello, BoltMD!");
}
```
````

```javascript
function hello() {
  console.log("Hello, BoltMD!");
}
```

```python
def hello():
    print("Hello, BoltMD!")
```

```rust
fn main() {
    println!("Hello, BoltMD!");
}
```

---

## Tables

```markdown
| Feature    | BoltMD | Others  |
|------------|--------|---------|
| Speed      | ⚡ Fast | 🐌 Slow |
| Size       | 15 MB  | 200 MB  |
| Open Source | ✅     | ❌      |
```

| Feature    | BoltMD | Others  |
|------------|--------|---------|
| Speed      | ⚡ Fast | 🐌 Slow |
| Size       | 15 MB  | 200 MB  |
| Open Source | ✅     | ❌      |

> Align columns with `:` — left `:---`, center `:---:`, right `---:`

---

## Horizontal Rules

Three or more dashes, asterisks, or underscores:

```markdown
---
***
___
```

---

## Math (LaTeX)

Inline math: `$E = mc^2$` → $E = mc^2$

Block math:

```markdown
$$
\frac{-b \pm \sqrt{b^2 - 4ac}}{2a}
$$
```

$$
\frac{-b \pm \sqrt{b^2 - 4ac}}{2a}
$$

---

## Footnotes

```markdown
Here's a statement with a footnote[^1].

[^1]: This is the footnote content.
```

Here's a statement with a footnote[^1].

[^1]: This is the footnote content.

---

## Emoji

You can use emoji shortcodes or paste them directly:

```markdown
:rocket: :heart: :star:
🚀 ❤️ ⭐
```

🚀 ❤️ ⭐ 🎉 ✅ 💡 🔥 ⚡

---

## Summary Cheat Sheet

| Element | Syntax |
|---------|--------|
| Heading | `# H1` `## H2` `### H3` |
| Bold | `**text**` |
| Italic | `*text*` |
| Strikethrough | `~~text~~` |
| Link | `[title](url)` |
| Image | `![alt](url)` |
| Code | `` `code` `` |
| Code Block | ```` ``` lang ```` |
| Blockquote | `> text` |
| Unordered List | `- item` |
| Ordered List | `1. item` |
| Task | `- [x] done` |
| Table | `\| col \| col \|` |
| Horizontal Rule | `---` |
| Math | `$formula$` |
| Footnote | `[^1]` |

---

*Now you know Markdown! Start writing something amazing.* ⚡
