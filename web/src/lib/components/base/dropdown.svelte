<script context="module" lang="ts">
    export type DropdownItem = {
        text: string;
        value: any;
        icon?: string;
    };
</script>

<script lang="ts">
    import { createEventDispatcher } from "svelte";

    export let items: DropdownItem[] = [];
    export let size: string = "regular";

    const dispatch = createEventDispatcher();

    let isOpen = false;

    export function toggleMenu(e: MouseEvent) {
        e.stopPropagation();
        e.preventDefault();
        isOpen = !isOpen;
    }

    function closeMenu() {
        isOpen = false;
    }

    function handleItemClick(item: { text: string; value: any }) {
        dispatch("change", item);
        closeMenu();
    }
</script>

<svelte:window on:mouseup={() => (isOpen = false)} />

<div class="dropdown relative">
    <slot {toggleMenu}>
        <button
            class="btn-icon flex items-center justify-center"
            on:click={toggleMenu}
            type="button"
        >
            <i class="fa fa-ellipsis-vertical text-{size}"></i>
        </button>
    </slot>

    {#if isOpen}
        <ul
            class="menu absolute bg-menu-background border border-input-border rounded-l-xl rounded-b-xl shadow-md right-0 overflow-hidden mt-2"
            class:none={isOpen}
            style="z-index: 1001"
        >
            {#each items as item}
                <li
                    class="menu-item flex items-center px-4 py-3 cursor-pointer hover:bg-menu-item-background-hover focus:bg-menu-item-background-focus transition-colors"
                    role="presentation"
                    on:mouseup|stopPropagation={() => handleItemClick(item)}
                >
                    {#if item.icon}
                        <i class="fa fa-{item.icon} mr-3"></i>
                    {/if}
                    <span class="whitespace-nowrap">{item.text}</span>
                </li>
            {/each}
        </ul>
    {/if}
</div>

<style>
</style>
