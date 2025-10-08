# Spec Browser

Browse and organize markdown specification files with YAML metadata in VS Code.

## Features

- **📁 Browse Specs** - Organize your markdown spec files by folders
- **📊 Status Tracking** - View status from YAML frontmatter with icons (✓ completed, ⏱ in progress, ○ pending)
- **📈 Summary Display** - See completion stats for each folder at a glance
- **🔍 Filter Completed** - Hide completed specs to focus on active work
- **⤢ Expand/Collapse All** - Toggle all folders at once
- **💾 Persistent Settings** - Remembers your specs directory across sessions

## Usage

1. Click the folder icon in the Specs sidebar to select your specs directory
2. Browse your spec folders and files
3. Click on a folder to open its README.md
4. Click on a spec file to open it
5. Use the toolbar buttons to:
   - 📁 Change specs directory
   - ⤢ Expand/collapse all folders
   - 🔍 Hide/show completed specs

## Spec File Format

Your markdown files should have YAML frontmatter with a `status` field:

```markdown
---
status: completed
---

# Your Spec Title

Content here...
```

Supported status values:
- `completed`, `done` - Shows ✓ icon
- `in progress`, `wip` - Shows ⏱ icon
- `pending`, `todo` - Shows ○ icon
- Any other value - Shows ● icon

## Requirements

- VS Code 1.75.0 or higher
- Markdown files with YAML frontmatter

## Release Notes

### 0.1.0

Initial release with:
- Spec directory browser
- Status icons and summaries
- Filter and expand/collapse features
- Persistent settings

## License

MIT
