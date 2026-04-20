<script setup lang="ts">
import SplitView from './components/editor/SplitView.vue'

const demoContent = `# Heading 1

## Heading 2

### Heading 3

This is a paragraph with **bold**, *italic*, ~~strikethrough~~, and \`inline code\`.

- Unordered item 1
- Unordered item 2

1. Ordered item 1
2. Ordered item 2

- [ ] Task unchecked
- [x] Task checked

> This is a blockquote

---

[Link example](https://example.com)

\`\`\`js
function hello() {
  const name = "BoltMD";
  console.log(name);
  return 42;
}
\`\`\`

| Header 1 | Header 2 | Header 3 |
|----------|----------|----------|
| Cell 1   | Cell 2   | Cell 3   |
| Cell 4   | Cell 5   | Cell 6   |
| Cell 7   | Cell 8   | Cell 9   |
`
</script>

<template>
  <div class="app-shell" style="height: 100vh; display: flex; flex-direction: column;">
    <SplitView :content="demoContent" />
  </div>
</template>
