import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import { BUILTIN_TOOLS, mergeBuiltinTools } from '../src/data/tools';
import { DEFAULT_SESSION } from '../src/App';

describe('Stardust tool contract', () => {
  it('defines eight unique client tools', () => {
    expect(BUILTIN_TOOLS).toHaveLength(8);
    expect(new Set(BUILTIN_TOOLS.map((tool) => tool.name)).size).toBe(8);
    for (const tool of BUILTIN_TOOLS) expect(tool.operation_mode).toBe('client_mode');
  });

  it('matches the complete JSON contract in tool-schemas.md', () => {
    const markdown = fs.readFileSync('docs/tool-schemas.md', 'utf8');
    const json = markdown.match(/```json\n([\s\S]*?)\n```/)?.[1];
    expect(json).toBeTruthy();
    expect(JSON.parse(json!)).toEqual(JSON.parse(JSON.stringify(BUILTIN_TOOLS)));
  });

  it('expands all eight tools in the default session JSON', () => {
    expect((DEFAULT_SESSION.model as any).tools).toEqual(BUILTIN_TOOLS);
  });

  it('does not warn when the default session definitions are normalized', () => {
    const warning = vi.fn();
    const result = mergeBuiltinTools(DEFAULT_SESSION, warning) as any;
    expect(warning).not.toHaveBeenCalled();
    expect(result.model.tools).toEqual(BUILTIN_TOOLS);
  });

  it('replaces same-name user tools and preserves other tools', () => {
    const warning = vi.fn();
    const result = mergeBuiltinTools({ model: { tools: [{ type: 'function', name: 'navigate_to' }, { type: 'function', name: 'custom_tool' }] } }, warning) as any;
    expect(warning).toHaveBeenCalledWith('navigate_to');
    expect(result.model.tools.filter((tool: any) => tool.name === 'navigate_to')).toHaveLength(1);
    expect(result.model.tools.some((tool: any) => tool.name === 'custom_tool')).toBe(true);
  });

  it('explicitly clears omitted user tools before adding builtins', () => {
    const result = mergeBuiltinTools({ model: {} }, () => undefined) as any;
    expect(result.model.tools).toHaveLength(8);
  });
});
