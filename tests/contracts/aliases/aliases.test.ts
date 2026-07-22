import { describe, expect, it } from 'vitest';
import { ACTIONS, EXPRESSIONS, LOCATIONS } from '../../../src/data/scene';
import { BUILTIN_TOOLS } from '../../../src/data/tools';

describe('alias enums', () => {
  it('keeps action aliases synchronized with execute_action enum', () => {
    const tool = BUILTIN_TOOLS.find((item) => item.name === 'execute_action') as any;
    expect(new Set(tool.parameters.properties.action.enum)).toEqual(new Set(Object.keys(ACTIONS)));
  });

  it('keeps expression aliases synchronized with set_expression enum', () => {
    const tool = BUILTIN_TOOLS.find((item) => item.name === 'set_expression') as any;
    expect(new Set(tool.parameters.properties.expression.enum)).toEqual(new Set(Object.keys(EXPRESSIONS)));
  });

  it('has unique navigation aliases', () => {
    const names = LOCATIONS.flatMap((location) => [location.name, ...location.aliases]);
    expect(new Set(names).size).toBe(names.length);
  });
});
