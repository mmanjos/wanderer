<script lang="ts">
    import { goto } from "$app/navigation";
    import { page } from "$app/stores";
    import { env } from "$env/dynamic/public";
    import Button from "$lib/components/base/button.svelte";
    import TextField from "$lib/components/base/text_field.svelte";
    import LogoTextTwoLineDark from "$lib/components/logo/logo_text_two_line_dark.svelte";
    import LogoTextTwoLineLight from "$lib/components/logo/logo_text_two_line_light.svelte";
    import { theme } from "$lib/stores/theme_store";
    import { show_toast } from "$lib/stores/toast_store";
    import { login, type User } from "$lib/stores/user_store";
    import { createForm } from "$lib/vendor/svelte-form-lib";
    import { ClientResponseError, type AuthProviderInfo } from "pocketbase";
    import { _ } from "svelte-i18n";
    import { object, string } from "yup";

    let loading: boolean = false;

    const redirectURL = "/redirect";

    const authProviders = $page.data.authMethods.authProviders;
    const { form, errors, handleChange, handleSubmit } = createForm<User>({
        initialValues: {
            id: "",
            username: "",
            password: "",
        },
        validationSchema: object<User>({
            username: string().required($_("required")),
            password: string().required($_("required")),
        }),
        onSubmit: async (newUser) => {
            loading = true;
            try {
                await login(newUser);
                goto($page.url.searchParams.get("r") ?? "/");
            } catch (e) {
                if (
                    e instanceof ClientResponseError &&
                    e.message == "Failed to authenticate."
                ) {
                    show_toast({
                        icon: "close",
                        type: "error",
                        text: $_("wrong-username-or-password"),
                    });
                } else {
                    show_toast({
                        icon: "close",
                        type: "error",
                        text: $_("error-during-login"),
                    });
                }
            } finally {
                loading = false;
            }
        },
    });

    function setProvider(provider: AuthProviderInfo) {
        localStorage.setItem(
            "provider",
            JSON.stringify(provider),
        );
    }
</script>

<svelte:head>
    <title>{$_("login")} | wanderer</title>
</svelte:head>
<main class="flex justify-center">
    <form
        class="login-panel max-w-md border border-input-border rounded-xl p-8 flex flex-col justify-center items-center gap-4 w-[28rem] mt-8"
        on:submit={handleSubmit}
    >
        {#if $theme == "light"}
            <LogoTextTwoLineDark></LogoTextTwoLineDark>
        {:else}
            <LogoTextTwoLineLight></LogoTextTwoLineLight>
        {/if}
        <h4 class="text-xl font-semibold">{$_("slogan")}</h4>
        <div class="space-y-6 w-80">
            <TextField
                name="username"
                label="{$_('username')}/{$_('email')}"
                bind:value={$form.username}
                on:change={handleChange}
                error={$errors.username}
            ></TextField>
            <TextField
                name="password"
                label={$_("password")}
                type="password"
                bind:value={$form.password}
                on:change={handleChange}
                error={$errors.password}
            ></TextField>
            <Button
                primary={true}
                extraClasses={"min-w-full"}
                type="submit"
                {loading}>Login</Button
            >
        </div>
        {#if env.PUBLIC_DISABLE_SIGNUP === "false"}
            <span
                >{$_("no-account")}
                <a class="text-blue-500 underline" href="/register"
                    >{$_("make-one")}</a
                ></span
            >
        {/if}
        {#if authProviders.length}
            <div class="flex gap-4 items-center w-full">
                <hr class="basis-full border-input-border" />
                <span class="text-gray-500 uppercase">{$_("or")}</span>
                <hr class="basis-full border-input-border" />
            </div>
            <div class="w-80 space-y-4">
                {#each authProviders as provider}
                    <a
                        href={provider.url}
                        class="btn-secondary inline-flex min-w-full justify-center"
                        on:click={() => setProvider(provider)}
                    >
                        <img
                            class="w-5 aspect-square mr-4"
                            src={provider.img}
                            alt="Provider logo"
                        />
                        Login with {provider.displayName}
                    </a>
                {/each}
            </div>
        {/if}
    </form>
</main>
