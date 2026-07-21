const fs = require('fs');

const filepath = 'SearchScreen.tsx';
let content = fs.readFileSync(filepath, 'utf-8');

// Add useRecipes and StorageService imports
content = content.replace("import { useProfile } from './app/context/ProfileContext';", "import { useProfile } from './app/context/ProfileContext';\nimport { useRecipes } from './app/useRecipes';\nimport { StorageService, ScanRecord } from './app/services/storage';\nimport { useFocusEffect } from 'expo-router';");

// Add state for quick filters
content = content.replace("const [searchQuery, setSearchQuery] = useState('');", "const [searchQuery, setSearchQuery] = useState('');\n  const [searchFilter, setSearchFilter] = useState<'all'|'foods'|'recipes'|'lists'|'receipts'>('all');\n  const [scans, setScans] = useState<ScanRecord[]>([]);");

// Add useFocusEffect for fetching scans
content = content.replace("const { profile } = useProfile();", "const { profile } = useProfile();\n  const { recipes } = useRecipes();\n\n  useFocusEffect(\n    React.useCallback(() => {\n      StorageService.getScans().then(setScans);\n    }, [])\n  );");

fs.writeFileSync(filepath, content, 'utf-8');
