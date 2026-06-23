_prod_completion() {
    local cur
    cur="${COMP_WORDS[COMP_CWORD]}"

    if [[ $COMP_CWORD -eq 1 ]]; then
        COMPREPLY=($(compgen -W "start stop reset attach status" -- "$cur"))
    elif [[ $COMP_CWORD -eq 2 && "${COMP_WORDS[1]}" == "start" ]]; then
        local recipes
        recipes=$(bun run "$HOME/Localization_ws/src/cli/index.ts" prod --list-recipes 2>/dev/null)
        COMPREPLY=($(compgen -W "$recipes" -- "$cur"))
    fi
}

complete -F _prod_completion prod
