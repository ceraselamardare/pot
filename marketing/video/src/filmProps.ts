// Film-level props (director-owned): values set on the composition (e.g. --props='{"repoUrl":"github.com/org/repo"}')
// that individual scenes read without the registry having to thread props.
import { createContext, useContext } from "react";

export type FilmProps = { repoUrl?: string };
export const FilmPropsContext = createContext<FilmProps>({});
export const useFilmProps = () => useContext(FilmPropsContext);
