# Fzf-powered TAB completion for localization-ws bun run commands.
# Frequency tracking via SQLite — frequently used items sort to top.
#
# Usage: source ~/Localization_ws/completions/bun-localization.bash

_l10n_ws() {
    echo "$HOME/Localization_ws"
}

_l10n_context() {
    local cword=$1; shift
    local words=("$@")

    # bun run <TAB> → context "command"
    if [[ $cword -eq 2 ]]; then
        echo "command"
        return
    fi

    local cmd="${words[2]}"
    if [[ -z "$cmd" ]]; then
        return
    fi

    # bun run <cmd> <TAB> → context is the command name
    # e.g. "prod", "smoke", "docker-dbuild", "rviz", etc.
    if [[ $cword -eq 3 ]]; then
        echo "$cmd"
        return
    fi

    # bun run <cmd> <sub> <TAB> → deeper context
    local sub="${words[3]}"
    case "$cmd" in
        prod)
            # start / slam / slam-map / reloc accept a recipe
            if [[ "$sub" == "start" || "$sub" == "slam" || "$sub" == "slam-map" || "$sub" == "reloc" ]]; then
                echo "recipe"
            fi
            ;;
        doc)
            if [[ "$sub" == "pipeline" ]]; then
                echo "recipe"
            fi
            ;;
        docker-start|docker-shell)
            echo "recipe"
            ;;
    esac
    # other commands: no deeper completions
}

_bun_run_complete() {
    local cur="${COMP_WORDS[COMP_CWORD]}"

    # Only handle "bun run ..."
    [[ ${#COMP_WORDS[@]} -lt 2 ]] && return
    [[ "${COMP_WORDS[1]}" != "run" ]] && return

    # "bun <TAB>" at level-1 — provide basic bun subcommands
    if [[ $COMP_CWORD -eq 1 ]]; then
        COMPREPLY=($(compgen -W "run install dev test build remove add upgrade --version --help" -- "$cur"))
        return
    fi

    local ws; ws=$(_l10n_ws)
    [[ -d "$ws" ]] || return

    local context; context=$(_l10n_context "$COMP_CWORD" "${COMP_WORDS[@]}")
    [[ -z "$context" ]] && return

    # Get frequency-sorted completions from SQLite
    local completions
    completions=$(bun --silent "$ws/src/cli/index.ts" completions-list "$context" 2>/dev/null)
    [[ -z "$completions" ]] && return

    if [[ -t 0 ]] && command -v fzf &>/dev/null; then
        local selected
        selected=$(echo "$completions" | fzf --select-1 --exit-0 --height=40% --query="$cur" 2>/dev/tty)
        if [[ -n "$selected" ]]; then
            COMPREPLY=("$selected")
            # Fire-and-forget: log selection to SQLite for frequency tracking
            bun --silent "$ws/src/cli/index.ts" completions-log "$context" "$selected" &>/dev/null &
        fi
    else
        # Fallback: standard compgen when fzf unavailable or non-TTY
        COMPREPLY=($(compgen -W "$completions" -- "$cur"))
    fi
}

complete -F _bun_run_complete bun
