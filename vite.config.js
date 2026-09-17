import { defineConfig } from 'vite';
import {fileURLToPath} from 'node:url';
export default defineConfig({base:'./',resolve:{alias:{'#catalog':fileURLToPath(new URL('./src/catalog.public.json',import.meta.url))}},define:{__PUBLIC_LIBRARY__:'true'},build:{target:'es2022'}});
