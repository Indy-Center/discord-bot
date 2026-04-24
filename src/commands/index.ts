import { accept } from './accept';
import { deny } from './deny';
import { done } from './done';
import type { Command } from './command';

export const COMMANDS: Record<string, Command> = { accept, deny, done };
