/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { bindThis } from '@/decorators.js';

/**
 * Special set-like class that counts add() and delete() calls instead of ignoring duplicates.
 *
 * For example, 4x calls to add('hello, world!') followed by 3x calls to delete('hello, world!') will not actually remove the entry.
 * A 4th call to delete() *will* remove the entry, provided that no additional add() calls have been made.
 *
 * By default, the CountingSet will not count negative.
 * That is to say - calling delete() repeatedly for an item that has already been removed will have no effect.
 * If this is not desired, then the set can be configured to allow debt (negative counts) with a constructor parameter.
 */
export class CountingSet<T> implements Iterable<T> {
	private readonly map = new Map<T, number>();
	private readonly set = new Set<T>();

	private readonly allowDebt: boolean;

	constructor(opts?: { allowDebt?: boolean }) {
		this.allowDebt = opts?.allowDebt ?? false;
	}

	/**
	 * The number of items present in the set.
	 * Only positive counts are included; items with a zero or negative count are excluded.
	 */
	public get size(): number {
		return this.set.size;
	}

	/**
	 * Adds an item to the set and returns the new count.
	 */
	@bindThis
	public add(item: T): number {
		const newCount = this.count(item) + 1;

		// Remove and re-insert to fix ordering
		this.set.delete(item);
		this.set.add(item);

		this.map.set(item, newCount);
		return newCount;
	}

	/**
	 * Removes an item from the set and returns the new count.
	 * By default, this number will never be less than zero.
	 * If debt is enabled, then it will be negative if the same item has been removed more than it's been added.
	 */
	@bindThis
	public remove(item: T): number {
		const newCount = this.count(item) - 1;

		if (newCount === 0) {
			// Remove items when reaching count=0
			this.map.delete(item);
			this.set.delete(item);
		} else if (newCount > 0 || this.allowDebt) {
			// Update items when count>0, or count<0 and debt is allowed.
			this.map.set(item, newCount);
		}

		return newCount;
	}

	/**
	 * Alias for remove().
	 */
	@bindThis
	public delete(item: T): number {
		return this.remove(item);
	}

	/**
	 * Removes all instances of the given item from the set, returning its count to zero.
	 * Returns true if any counts were removed, false otherwise.
	 */
	@bindThis
	public zero(item: T): boolean {
		this.map.delete(item);
		return this.set.delete(item);
	}

	/**
	 * Returns the current count of an item.
	 * By default, this number will never be less than zero.
	 * If debt is enabled, then it will be negative if the same item has been removed more than it's been added.
	 */
	@bindThis
	public count(item: T): number {
		return this.map.get(item) ?? 0;
	}

	/**
	 * Returns true if the item is present with a positive count, or false otherwise.
	 */
	@bindThis
	public has(item: T): boolean {
		return this.set.has(item);
	}

	/**
	 * Removes all items and debt from the set, returning it to the initial empty state.
	 */
	@bindThis
	public clear(): void {
		this.map.clear();
		this.set.clear();
	}

	/**
	 * Returns all items present in the set.
	 * Only positive counts are included; items with a zero or negative count are excluded.
	 */
	@bindThis
	public items(): IterableIterator<T> {
		return this.set.values();
	}

	/**
	 * Alias to items().
	 */
	public [Symbol.iterator](): IterableIterator<T> {
		return this.set.values();
	}

	/**
	 * Returns all items tracked in the set, whether present (having a positive count) or not.
	 */
	@bindThis
	public entries(): IterableIterator<[ item: T, count: number ]> {
		return this.map.entries();
	}

	/**
	 * Returns the oldest (least-recently added) item in the set, or undefined if the set is empty.
	 * Negative counts are ignored.
	 */
	@bindThis
	public oldest(): T | undefined {
		return this.set.values().next().value;
	}
}
