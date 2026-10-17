"""Freeze a reversible source extension only after the unchanged native replay passes."""
import difflib
import hashlib
import json
import subprocess
from pathlib import Path

baseline = '8000228d77c91ceed98e604c50290aac4271ba7e'
fixture = Path('games/magic/fixtures/accuracy')
replay = json.loads((fixture / 'printing-calibration-legacy-replay.json').read_text())
assert replay['baselineCommit'] == baseline
assert replay['changed'] == 0 and replay['cards'] >= 80
assert all(row['sha256'] == row['after'] for row in replay['rows'])
files = set(subprocess.check_output(['git', 'diff', '--name-only', baseline, '--', 'games/magic/src'], text=True).splitlines())
files.update(subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard', '--', 'games/magic/src'], text=True).splitlines())
hash_bytes = lambda data: hashlib.sha256(data).hexdigest()
proof = {'schemaVersion': 1, 'baselineCommit': baseline,
         'policy': 'Optional calibration policy only. Historical fit receipts retain their original hashes and scores; native replay verifies the unchanged legacy rendering path. Reverse edits reconstruct each complete baseline source file, while dependencies bind the new policy implementation.',
         'dependencies': {}, 'files': {}}
for file in sorted(files):
    current = Path(file).read_bytes()
    proof['dependencies'][file] = hash_bytes(current)
    old = subprocess.run(['git', 'show', baseline + ':' + file], capture_output=True)
    if old.returncode:
        continue
    old_lines = old.stdout.decode().splitlines(keepends=True)
    new_lines = current.decode().splitlines(keepends=True)
    edits = []
    for tag, i, j, a, b in difflib.SequenceMatcher(a=new_lines, b=old_lines, autojunk=False).get_opcodes():
        if tag != 'equal':
            edits.append({'start': i, 'count': j - i, 'lines': old_lines[a:b]})
    proof['files'][file] = {'before': hash_bytes(old.stdout), 'after': hash_bytes(current), 'reverseEdits': list(reversed(edits))}
(fixture / 'printing-calibration-source-compatibility.json').write_text(json.dumps(proof, indent=2, ensure_ascii=False) + '\n')
