<script lang="ts">
    import Button from "$lib/components/base/button.svelte";
    import Select from "$lib/components/base/select.svelte";
    import TextField from "$lib/components/base/text_field.svelte";
    import Textarea from "$lib/components/base/textarea.svelte";
    import Toggle from "$lib/components/base/toggle.svelte";
    import ListSelectModal from "$lib/components/list/list_select_modal.svelte";
    import SummitLogCard from "$lib/components/summit_log/summit_log_card.svelte";
    import SummitLogModal from "$lib/components/summit_log/summit_log_modal.svelte";
    import PhotoPicker from "$lib/components/trail/photo_picker.svelte";
    import WaypointCard from "$lib/components/waypoint/waypoint_card.svelte";
    import WaypointModal from "$lib/components/waypoint/waypoint_modal.svelte";
    import type { List } from "$lib/models/list";
    import { SummitLog } from "$lib/models/summit_log";
    import { Trail } from "$lib/models/trail";
    import { Waypoint } from "$lib/models/waypoint";
    import { categories } from "$lib/stores/category_store";
    import {
        lists,
        lists_add_trail,
        lists_index,
        lists_remove_trail,
    } from "$lib/stores/list_store";
    import { summitLog } from "$lib/stores/summit_log_store";
    import { show_toast } from "$lib/stores/toast_store";
    import {
        trail,
        trails_create,
        trails_update,
    } from "$lib/stores/trail_store";
    import { waypoint } from "$lib/stores/waypoint_store";
    import { getFileURL } from "$lib/util/file_util";
    import {
        formatDistance,
        formatElevation,
        formatTimeHHMM,
    } from "$lib/util/format_util";
    import { fromKML, fromTCX } from "$lib/util/gpx_util";
    import { createMarkerFromWaypoint } from "$lib/util/leaflet_util";
    import "$lib/vendor/leaflet-elevation/src/index.css";
    import { createForm } from "$lib/vendor/svelte-form-lib";
    import cryptoRandomString from "crypto-random-string";
    import type { GPX, Icon, LeafletEvent, Map } from "leaflet";
    import "leaflet.awesome-markers/dist/leaflet.awesome-markers.css";
    import "leaflet/dist/leaflet.css";
    import { onMount } from "svelte";
    import { _ } from "svelte-i18n";
    import { array, number, object, string } from "yup";

    export let data: { trail: Trail };

    let L: any;
    let map: Map;

    let gpxLayer: GPX;

    let openWaypointModal: () => void;
    let openSummitLogModal: () => void;
    let openListSelectModal: () => void;

    let loading = false;

    let editingBasicInfo: boolean = false;

    let photoFiles: File[] = [];

    let gpxFile: File | Blob | null = null;

    const trailSchema = object<Trail>({
        id: string().optional(),
        name: string().required($_("required")),
        location: string().optional(),
        distance: number().optional(),
        difficulty: string()
            .oneOf(["easy", "moderate", "difficult"])
            .optional(),
        elevation_gain: number().optional(),
        duration: number().optional(),
        thumbnail: string().optional(),
        photos: array(string()).optional(),
        gpx: string().optional(),
        description: string().optional(),
    });

    const { form, errors, handleChange, handleSubmit } = createForm<Trail>({
        initialValues: data.trail,
        validationSchema: trailSchema,
        onError: (errors) => {
            if (errors.name) {
                const nameInput = document.querySelector(
                    "input[name=name]",
                ) as HTMLElement;

                if (window.innerWidth < 768) {
                    window?.scroll({
                        top: nameInput.offsetTop - 24,
                        behavior: "smooth",
                    });
                } else {
                    const form = document.getElementById("trail-form");
                    form?.scroll({
                        top: nameInput.offsetTop - 130,
                        behavior: "smooth",
                    });
                }
            }
        },
        onSubmit: async (submittedTrail) => {
            loading = true;
            try {
                const htmlForm = document.getElementById(
                    "trail-form",
                ) as HTMLFormElement;
                const formData = new FormData(htmlForm);
                if (!formData.get("public")) {
                    submittedTrail.public = false;
                }
                submittedTrail.photos = submittedTrail.photos.filter(
                    (p) => !p.startsWith("data:image/svg+xml;base64"),
                );
                if (!submittedTrail.id) {
                    const createdTrail = await trails_create(
                        submittedTrail,
                        photoFiles,
                        gpxFile,
                    );
                    $form.id = createdTrail.id;
                } else {
                    await trails_update(
                        $trail,
                        submittedTrail,
                        photoFiles,
                        gpxFile,
                    );
                }

                show_toast({
                    type: "success",
                    icon: "check",
                    text: "Trail saved successfully.",
                });
            } catch (e) {
                console.error(e);

                show_toast({
                    type: "error",
                    icon: "close",
                    text: "Error saving trail.",
                });
            } finally {
                loading = false;
            }
        },
    });

    onMount(async () => {
        L = (await import("leaflet")).default;
        await import("leaflet-gpx");
        await import("leaflet.awesome-markers");

        map = L.map("map").setView([0, 0], 2);
        map.attributionControl.setPrefix(false);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "© OpenStreetMap contributors",
        }).addTo(map);

        if (
            data.trail.expand.gpx_data &&
            data.trail.expand.gpx_data.length > 0
        ) {
            addGPXLayer(data.trail.expand.gpx_data, false);
        }

        if (data.trail.expand.waypoints?.length > 0) {
            for (const waypoint of data.trail.expand.waypoints) {
                const marker = createMarkerFromWaypoint(
                    L,
                    waypoint,
                    (event) => {
                        var marker = event.target;
                        var position = marker.getLatLng();
                        const editableWaypoint = $form.expand.waypoints.find(
                            (w) => w.id == waypoint.id,
                        );
                        editableWaypoint!.lat = position.lat;
                        editableWaypoint!.lon = position.lng;
                        $form.expand.waypoints = [...$form.expand.waypoints];
                    },
                );
                marker.addTo(map);
            }
        }
    });

    function addGPXLayer(gpx: string, addWaypoints: boolean = true) {
        return new Promise<void>(function (resolve, reject) {
            gpxLayer?.remove();
            gpxLayer = new L.GPX(gpx, {
                async: true,
                polyline_options: {
                    className: "lightblue-theme elevation-polyline",
                    opacity: 0.75,
                    weight: 5,
                },
                gpx_options: {
                    parseElements: [
                        "track",
                        "route",
                        ...(addWaypoints ? ["waypoint"] : []),
                    ],
                },
                marker_options: {
                    wptIcons: {
                        "": L.AwesomeMarkers.icon({
                            icon: "circle",
                            prefix: "fa",
                            markerColor: "cadetblue",
                            iconColor: "white",
                        }) as Icon,
                    },
                    startIcon: L.AwesomeMarkers.icon({
                        icon: "circle-half-stroke",
                        prefix: "fa",
                        markerColor: "cadetblue",
                        iconColor: "white",
                    }) as Icon,
                    endIcon: L.AwesomeMarkers.icon({
                        icon: "flag-checkered",
                        prefix: "fa",
                        markerColor: "cadetblue",
                        iconColor: "white",
                    }) as Icon,
                    startIconUrl: "",
                    endIconUrl: "",
                    shadowUrl: "",
                },
            })
                .on("addpoint", function (e: any) {
                    if (e.point_type === "start") {
                        e.point.setZIndexOffset(1000);
                        $form.lat = e.point._latlng.lat;
                        $form.lon = e.point._latlng.lng;
                    } else if (e.point_type === "waypoint") {
                        const waypoint = new Waypoint(
                            e.point._latlng.lat,
                            e.point._latlng.lng,
                            { name: e.point.options.title, marker: e.point },
                        );
                        $form.expand.waypoints.push(waypoint);
                    }
                })
                .on("loaded", function (e: LeafletEvent) {
                    map.fitBounds(e.target.getBounds());
                    if (!$form.id) {
                        $form.name = e.target._info.name;
                    }
                    $form.distance = Math.round(e.target.get_distance());
                    $form.elevation_gain = Math.round(
                        e.target.get_elevation_gain(),
                    );
                    $form.duration = Math.round(
                        e.target.get_total_time() / 1000 / 60,
                    );
                    resolve();
                })
                .on("error", reject)
                .addTo(map);
        });
    }

    function openFileBrowser() {
        document.getElementById("fileInput")!.click();
    }

    function handleFileSelection() {
        const selectedFile = (
            document.getElementById("fileInput") as HTMLInputElement
        ).files?.[0];

        if (!selectedFile) {
            return;
        }

        $form.expand.waypoints = [];
        $form.waypoints = [];

        var reader = new FileReader();

        reader.readAsText(selectedFile);

        reader.onload = async function (e) {
            let gpxData = "";
            const fileContent = e.target?.result as string;
            if (fileContent.includes("http://www.opengis.net/kml")) {
                gpxData = fromKML(e.target?.result as string);
                gpxFile = new Blob([gpxData], { type: "application/gpx+xml" });
            } else if (fileContent.includes("TrainingCenterDatabase")) {
                gpxData = fromTCX(e.target?.result as string);
                gpxFile = new Blob([gpxData], { type: "application/gpx+xml" });
            } else {
                gpxData = fileContent;
                gpxFile = selectedFile;
            }
            try {
                await addGPXLayer(gpxData);
            } catch (e) {
                show_toast({
                    icon: "close",
                    type: "error",
                    text: $_("error-reading-file"),
                });
                return;
            }
            const r = await fetch("/api/v1/search/cities500", {
                method: "POST",
                body: JSON.stringify({
                    q: "",
                    options: {
                        filter: [
                            `_geoRadius(${$form.lat}, ${$form.lon}, 10000)`,
                        ],
                        sort: [`_geoPoint(${$form.lat}, ${$form.lon}):asc`],
                        limit: 1,
                    },
                }),
            });
            const closestCity = (await r.json()).hits[0];

            $form.location = closestCity.name;
        };
    }

    function openMarkerPopup(waypoint: Waypoint) {
        waypoint.marker?.openPopup();
    }

    function handleWaypointMenuClick(
        currentWaypoint: Waypoint,
        index: number,
        e: CustomEvent<{ text: string; value: string }>,
    ) {
        if (e.detail.value === "edit") {
            waypoint.set(currentWaypoint);
            openWaypointModal();
        } else if (e.detail.value === "delete") {
            currentWaypoint.marker?.remove();
            $form.expand.waypoints.splice(index, 1);
            $form.waypoints.splice(index, 1);
            $form.expand.waypoints = $form.expand.waypoints;
        }
    }

    function beforeWaypointModalOpen() {
        const mapCenter = map.getCenter();
        waypoint.set(new Waypoint(mapCenter.lat, mapCenter.lng));
        openWaypointModal();
    }

    function saveWaypoint(savedWaypoint: Waypoint) {
        let editedWaypointIndex = $form.expand.waypoints.findIndex(
            (s) => s.id == savedWaypoint.id,
        );

        if (editedWaypointIndex >= 0) {
            $form.expand.waypoints[editedWaypointIndex].marker?.remove();
            $form.expand.waypoints[editedWaypointIndex] = savedWaypoint;
        } else {
            savedWaypoint.id = cryptoRandomString({ length: 15 });

            $form.expand.waypoints = [...$form.expand.waypoints, savedWaypoint];
        }
        const marker = createMarkerFromWaypoint(L, savedWaypoint, (event) => {
            var marker = event.target;
            var position = marker.getLatLng();
            const editableWaypoint = $form.expand.waypoints.find(
                (w) => w.id == savedWaypoint.id,
            );
            editableWaypoint!.lat = position.lat;
            editableWaypoint!.lon = position.lng;
            $form.expand.waypoints = [...$form.expand.waypoints];
        });

        marker.addTo(map);
        savedWaypoint.marker = marker;
    }

    function saveSummitLog(e: CustomEvent<SummitLog>) {
        const savedSummitLog = e.detail;
        let editedSummitLogIndex = $form.expand.summit_logs.findIndex(
            (s) => s.id == savedSummitLog.id,
        );

        if (editedSummitLogIndex >= 0) {
            $form.expand.summit_logs[editedSummitLogIndex] = savedSummitLog;
        } else {
            savedSummitLog.id = cryptoRandomString({ length: 15 });
            $form.expand.summit_logs = [
                ...$form.expand.summit_logs,
                savedSummitLog,
            ];
        }
    }

    function handleSummitLogMenuClick(
        currentSummitLog: SummitLog,
        index: number,
        e: CustomEvent<{ text: string; value: string }>,
    ) {
        if (e.detail.value === "edit") {
            summitLog.set(currentSummitLog);
            openSummitLogModal();
        } else if (e.detail.value === "delete") {
            $form.expand.summit_logs.splice(index, 1);
            $form.summit_logs.splice(index, 1);
            $form.expand.summit_logs = $form.expand.summit_logs;
        }
    }

    async function handleListSelection(list: List) {
        if (!$form.id) {
            return;
        }
        try {
            if (list.trails?.includes($form.id!)) {
                await lists_remove_trail(list, $form);
            } else {
                await lists_add_trail(list, $form);
            }
            await lists_index();
        } catch (e) {
            console.error(e);

            show_toast({
                type: "error",
                icon: "close",
                text: "Error adding trail to list.",
            });
        }
    }
</script>

<svelte:head>
    <title
        >{$form.id ? `${$form.name} | ${$_("edit")}` : $_("new-trail")} | wanderer</title
    >
</svelte:head>

<main class="grid grid-cols-1 md:grid-cols-[400px_1fr]">
    <form
        id="trail-form"
        class="overflow-y-auto overflow-x-hidden flex flex-col gap-4 px-8 order-1 md:order-none mt-8 md:mt-0"
        on:submit={handleSubmit}
    >
        <h3 class="text-xl font-semibold">{$_("pick-a-trail")}</h3>
        <button class="btn-primary" type="button" on:click={openFileBrowser}
            >{$_("upload-file")}</button
        >
        <input
            type="file"
            name="gpx"
            id="fileInput"
            accept=".gpx,.kml,.tcx"
            style="display: none;"
            on:change={handleFileSelection}
        />
        <hr class="border-separator" />
        <div class="flex gap-x-4">
            <h3 class="text-xl font-semibold">{$_("basic-info")}</h3>
            <button
                type="button"
                class="btn-icon"
                on:click={() => (editingBasicInfo = !editingBasicInfo)}
                ><i class="fa fa-{editingBasicInfo ? 'check' : 'pen'}"
                ></i></button
            >
        </div>

        <div class="flex gap-4 justify-around">
            {#if editingBasicInfo}
                <TextField
                    bind:value={$form.distance}
                    name="distance"
                    label={$_("distance")}
                ></TextField>
                <TextField
                    bind:value={$form.elevation_gain}
                    name="elevation_gain"
                    label={$_("elevation-gain")}
                ></TextField>
                <TextField
                    bind:value={$form.duration}
                    name="duration"
                    label={$_("est-duration")}
                ></TextField>
            {:else}
                <div class="flex flex-col">
                    <span>{$_("distance")}</span>
                    <span class="font-medium"
                        >{formatDistance($form.distance)}</span
                    >
                    <input
                        type="hidden"
                        name="distance"
                        value={$form.distance}
                    />
                </div>
                <div class="flex flex-col">
                    <span>{$_("elevation-gain")}</span>
                    <span class="font-medium"
                        >{formatElevation($form.elevation_gain)}</span
                    >
                    <input
                        type="hidden"
                        name="elevation_gain"
                        value={$form.elevation_gain}
                    />
                </div>
                <div class="flex flex-col">
                    <span>{$_("est-duration")}</span>
                    <span class="font-medium"
                        >{formatTimeHHMM($form.duration)}</span
                    >
                    <input
                        type="hidden"
                        name="duration"
                        value={$form.duration}
                    />
                </div>
            {/if}
            <input type="hidden" name="lat" value={$form.lat} />
            <input type="hidden" name="lon" value={$form.lon} />
        </div>
        <TextField
            name="name"
            label={$_("name")}
            on:change={handleChange}
            error={$errors.name}
            bind:value={$form.name}
        ></TextField>
        <TextField
            name="location"
            label={$_("location")}
            error={$errors.location}
            bind:value={$form.location}
        ></TextField>
        <Textarea
            name="description"
            label={$_("describe-your-trail")}
            bind:value={$form.description}
        ></Textarea>
        <Select
            name="difficulty"
            label={$_("difficulty")}
            bind:value={$form.difficulty}
            items={[
                { text: $_("easy"), value: "easy" },
                { text: $_("moderate"), value: "moderate" },
                { text: $_("difficult"), value: "difficult" },
            ]}
        ></Select>
        <Select
            name="category"
            label={$_("category")}
            bind:value={$form.category}
            items={$categories.map((c) => ({ text: c.name, value: c.id }))}
        ></Select>
        <Toggle name="public" label={$_("public")} bind:value={$form.public}
        ></Toggle>
        <hr class="border-separator" />
        <h3 class="text-xl font-semibold">{$_("waypoints")}</h3>
        <ul>
            {#each $form.expand.waypoints ?? [] as waypoint, i}
                <li on:mouseenter={() => openMarkerPopup(waypoint)}>
                    <WaypointCard
                        {waypoint}
                        mode="edit"
                        on:change={(e) =>
                            handleWaypointMenuClick(waypoint, i, e)}
                    ></WaypointCard>
                </li>
            {/each}
        </ul>
        <button
            class="btn-secondary"
            type="button"
            on:click={beforeWaypointModalOpen}
            ><i class="fa fa-plus mr-2"></i>{$_("add-waypoint")}</button
        >
        <hr class="border-separator" />
        <h3 class="text-xl font-semibold">{$_("photos")}</h3>
        <PhotoPicker
            id="trail"
            parent={$form}
            bind:photos={$form.photos}
            bind:thumbnail={$form.thumbnail}
            bind:photoFiles
        ></PhotoPicker>
        <hr class="border-separator" />
        <h3 class="text-xl font-semibold">{$_("summit-book")}</h3>
        <ul>
            {#each $form.expand.summit_logs ?? [] as log, i}
                <li>
                    <SummitLogCard
                        {log}
                        mode="edit"
                        on:change={(e) => handleSummitLogMenuClick(log, i, e)}
                    ></SummitLogCard>
                </li>
            {/each}
        </ul>
        <button
            class="btn-secondary"
            type="button"
            on:click={openSummitLogModal}
            ><i class="fa fa-plus mr-2"></i>{$_("add-entry")}</button
        >
        {#if $lists.length}
            <hr class="border-separator" />
            <h3 class="text-xl font-semibold">
                {$_("list", { values: { n: 2 } })}
            </h3>
            <div class="flex gap-4 flex-wrap">
                {#each $lists as list}
                    {#if $form.id && list.trails?.includes($form.id)}
                        <div
                            class="flex gap-2 items-center border border-input-border rounded-xl p-2"
                        >
                            {#if list.avatar}
                                <img
                                    class="w-8 aspect-square rounded-full object-cover"
                                    src={getFileURL(list, list.avatar)}
                                    alt="avatar"
                                />
                            {:else}
                                <div
                                    class="flex w-4 aspect-square shrink-0 items-center justify-center"
                                >
                                    <i class="fa fa-table-list text-5xl"></i>
                                </div>
                            {/if}
                            <span class="text-sm">{list.name}</span>
                        </div>
                    {/if}
                {/each}
            </div>
            <Button
                secondary={true}
                tooltip={$_("save-your-trail-first")}
                disabled={!$form.id}
                type="button"
                on:click={openListSelectModal}
                ><i class="fa fa-plus mr-2"></i>{$_("add-to-list")}</Button
            >
        {/if}
        <hr class="border-separator" />
        <Button
            primary={true}
            large={true}
            type="submit"
            extraClasses="mb-2"
            {loading}>{$_("save-trail")}</Button
        >
    </form>
    <div class="rounded-xl" id="map"></div>
</main>
<WaypointModal
    bind:openModal={openWaypointModal}
    on:save={(e) => saveWaypoint(e.detail)}
></WaypointModal>
<SummitLogModal bind:openModal={openSummitLogModal} on:save={saveSummitLog}
></SummitLogModal>
<ListSelectModal
    bind:openModal={openListSelectModal}
    on:change={(e) => handleListSelection(e.detail)}
></ListSelectModal>

<style>
    #map {
        height: calc(400px);
    }
    @media only screen and (min-width: 768px) {
        #map,
        form {
            height: calc(100vh - 124px);
        }
    }
</style>
