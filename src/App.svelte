<script>
    import { onMount } from "svelte";
    import FileDropzone from "./components/FileDropzone.svelte";
    import Viewer3D from "./components/Viewer3D.svelte";
    import LayerPanel from "./components/LayerPanel.svelte";
    import InfoPanel from "./components/InfoPanel.svelte";
    import ExportPanel from "./components/ExportPanel.svelte";

    let status = $state("idle"); // 'idle' | 'loading' | 'ready' | 'error'
    let progress = $state("");
    let errorMsg = $state("");
    let bodies = $state([]);
    let visibility = $state({});
    let zScale = $state(8);
    let boardZScale = $state(1);
    let previewFilter = $state(null);
    let previewLabel = $state("");
    let traceMode = $state("raise");
    let filename = $state("");
    let viewer = $state(null);

    let worker;

    onMount(() => {
        worker = new Worker("/step-worker.js");

        worker.onmessage = ({ data }) => {
            if (data.type === "PROGRESS") {
                progress = data.message;
            } else if (data.type === "RESULT") {
                bodies = data.bodies;
                visibility = Object.fromEntries(
                    data.bodies.map((b) => [b.name, true]),
                );
                status = "ready";
            } else if (data.type === "ERROR") {
                errorMsg = data.message;
                status = "error";
            }
        };

        worker.onerror = (e) => {
            errorMsg = e.message || "Worker error";
            status = "error";
        };

        return () => worker.terminate();
    });

    function handleFile(file) {
        filename = file.name;
        status = "loading";
        progress = "Reading file…";
        bodies = [];
        visibility = {};

        file.arrayBuffer().then((buf) => {
            worker.postMessage({ type: "PROCESS", buffer: buf }, [buf]);
        });
    }

    function toggleBody(name) {
        visibility = { ...visibility, [name]: !(visibility[name] ?? true) };
    }

    function toggleGroup(names, show) {
        const updates = Object.fromEntries(names.map((n) => [n, show]));
        visibility = { ...visibility, ...updates };
    }

    function handlePreviewChange(filter, label = "") {
        previewFilter = filter;
        previewLabel = label;
    }
</script>

<div class="h-screen flex flex-col bg-[#09090f] text-slate-100 font-sans">
    <!-- Header -->
    <header
        class="h-11 shrink-0 bg-[#111120] border-b border-[#2a2a48] flex items-center px-4 gap-3"
    >
        <div class="flex items-center gap-2">
            <!-- PCB icon -->
            <svg
                class="w-5 h-5 text-[#b87333]"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                viewBox="0 0 24 24"
            >
                <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25zm.75-12h9v9h-9v-9z"
                />
            </svg>
            <span class="text-sm font-semibold text-slate-100"
                >PCB 3D Print Tools</span
            >
        </div>

        <div class="w-px h-5 bg-[#2a2a48] mx-1"></div>

        {#if status === "ready"}
            <div class="flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span class="text-xs text-slate-400">{filename}</span>
            </div>
        {:else if status === "loading"}
            <div class="flex items-center gap-1.5">
                <svg
                    class="w-3.5 h-3.5 text-[#b87333] animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                >
                    <circle
                        class="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        stroke-width="4"
                    />
                    <path
                        class="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                </svg>
                <span class="text-xs text-slate-400">{progress}</span>
            </div>
        {/if}

        <div class="ml-auto flex items-center gap-2">
            <span class="text-xs text-slate-600">Bauhouse Consorxium 2026</span>
        </div>
    </header>

    <!-- Body -->
    <div class="flex-1 flex overflow-hidden">
        <!-- Sidebar -->
        <aside
            class="w-64 shrink-0 bg-[#111120] border-r border-[#2a2a48] flex flex-col overflow-y-auto"
        >
            <FileDropzone onfile={handleFile} disabled={status === "loading"} />
            <LayerPanel
                {bodies}
                {visibility}
                ontoggle={toggleBody}
                ontogglegroup={toggleGroup}
            />
            <InfoPanel {bodies} {filename} />
            <ExportPanel
                {viewer}
                bind:zScale
                bind:boardZScale
                bind:traceMode
                {bodies}
                {filename}
                onpreviewchange={handlePreviewChange}
            />
        </aside>

        <!-- 3D Viewer -->
        <main class="flex-1 relative overflow-hidden">
            <Viewer3D
                bind:this={viewer}
                {bodies}
                {visibility}
                {zScale}
                {boardZScale}
                {previewFilter}
                {traceMode}
            />

            <!-- Export preview badge -->
            {#if previewFilter !== null || previewLabel}
                <div
                    class="absolute top-3 left-1/2 -translate-x-1/2 z-10
          flex items-center gap-2 px-3 py-1.5 rounded-full
          bg-amber-500/20 border border-amber-500/40 backdrop-blur-sm pointer-events-none"
                >
                    <span
                        class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"
                    ></span>
                    <span class="text-xs font-medium text-amber-300"
                        >Export preview · {previewLabel}</span
                    >
                </div>
            {/if}

            <!-- Idle state overlay -->
            {#if status === "idle"}
                <div
                    class="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none"
                >
                    <svg
                        class="w-16 h-16 text-[#2a2a48]"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1"
                        viewBox="0 0 24 24"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9"
                        />
                    </svg>
                    <p class="text-slate-600 text-sm">
                        Drop a .step file to begin
                    </p>
                </div>
            {/if}

            <!-- Loading overlay -->
            {#if status === "loading"}
                <div
                    class="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#09090f]/80 backdrop-blur-sm"
                >
                    <div class="relative w-16 h-16">
                        <svg
                            class="w-16 h-16 text-[#b87333] animate-spin"
                            fill="none"
                            viewBox="0 0 24 24"
                        >
                            <circle
                                class="opacity-10"
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                stroke-width="2"
                            />
                            <path
                                class="opacity-90"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                            />
                        </svg>
                    </div>
                    <div class="text-center">
                        <p class="text-slate-200 text-sm font-medium">
                            {progress}
                        </p>
                        <p class="text-slate-500 text-xs mt-1">
                            WASM loads once, cached after first use
                        </p>
                    </div>
                </div>
            {/if}

            <!-- Error overlay -->
            {#if status === "error"}
                <div
                    class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#09090f]/80 backdrop-blur-sm"
                >
                    <svg
                        class="w-12 h-12 text-red-500"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.5"
                        viewBox="0 0 24 24"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                        />
                    </svg>
                    <div class="text-center max-w-sm px-4">
                        <p class="text-red-400 text-sm font-medium mb-1">
                            Failed to load STEP file
                        </p>
                        <p class="text-slate-500 text-xs break-words">
                            {errorMsg}
                        </p>
                    </div>
                    <button
                        onclick={() => {
                            status = "idle";
                            errorMsg = "";
                        }}
                        class="px-4 py-1.5 text-sm rounded bg-[#20203a] hover:bg-[#2a2a48] text-slate-300 transition-colors"
                    >
                        Dismiss
                    </button>
                </div>
            {/if}
        </main>
    </div>
</div>
