import type { TrailFilter } from "$lib/models/trail";
import { categories_index } from "$lib/stores/category_store";
import { trails_search_filter } from "$lib/stores/trail_store";
import type { ServerLoad } from "@sveltejs/kit";

export const load: ServerLoad = async ({ params, locals, url, fetch }) => {
    const filter: TrailFilter = {
        q: "",
        category: [],
        difficulty: ["easy", "moderate", "difficult"],
        near: {
            radius: 2000,
        },
        distanceMin: 0,
        distanceMax: 20000,
        distanceLimit: 20000,
        elevationGainMin: 0,
        elevationGainMax: 4000,
        elevationGainLimit: 4000,
        sort: "created",
        sortOrder: "+",
    };
    const paramCategory = url.searchParams.get("category");
    if (paramCategory) {
        filter.category.push(paramCategory);
    }
    const response = await trails_search_filter(filter, 1, fetch);
    await categories_index(fetch)

    return {
        filter: filter, pagination: { page: response.page, totalPages: response.totalPages }
    };
};