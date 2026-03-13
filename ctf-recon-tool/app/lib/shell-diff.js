function splitLines(value = '') {
  return String(value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
}

function buildLcsMatrix(leftLines, rightLines) {
  const rows = leftLines.length + 1;
  const cols = rightLines.length + 1;
  const matrix = Array.from({ length: rows }, () => Array(cols).fill(0));

  for (let leftIndex = leftLines.length - 1; leftIndex >= 0; leftIndex -= 1) {
    for (let rightIndex = rightLines.length - 1; rightIndex >= 0; rightIndex -= 1) {
      matrix[leftIndex][rightIndex] = leftLines[leftIndex] === rightLines[rightIndex]
        ? matrix[leftIndex + 1][rightIndex + 1] + 1
        : Math.max(matrix[leftIndex + 1][rightIndex], matrix[leftIndex][rightIndex + 1]);
    }
  }

  return matrix;
}

export function diffShellTranscriptContents(left = '', right = '') {
  const leftLines = splitLines(left);
  const rightLines = splitLines(right);
  const matrix = buildLcsMatrix(leftLines, rightLines);
  const changes = [];
  const summary = {
    additions: 0,
    removals: 0,
    unchanged: 0,
  };

  let leftIndex = 0;
  let rightIndex = 0;
  let leftLineNo = 1;
  let rightLineNo = 1;

  while (leftIndex < leftLines.length && rightIndex < rightLines.length) {
    if (leftLines[leftIndex] === rightLines[rightIndex]) {
      changes.push({
        type: 'context',
        line: leftLines[leftIndex],
        leftLineNo,
        rightLineNo,
      });
      summary.unchanged += 1;
      leftIndex += 1;
      rightIndex += 1;
      leftLineNo += 1;
      rightLineNo += 1;
      continue;
    }

    if (matrix[leftIndex + 1][rightIndex] >= matrix[leftIndex][rightIndex + 1]) {
      changes.push({
        type: 'remove',
        line: leftLines[leftIndex],
        leftLineNo,
        rightLineNo: null,
      });
      summary.removals += 1;
      leftIndex += 1;
      leftLineNo += 1;
      continue;
    }

    changes.push({
      type: 'add',
      line: rightLines[rightIndex],
      leftLineNo: null,
      rightLineNo,
    });
    summary.additions += 1;
    rightIndex += 1;
    rightLineNo += 1;
  }

  while (leftIndex < leftLines.length) {
    changes.push({
      type: 'remove',
      line: leftLines[leftIndex],
      leftLineNo,
      rightLineNo: null,
    });
    summary.removals += 1;
    leftIndex += 1;
    leftLineNo += 1;
  }

  while (rightIndex < rightLines.length) {
    changes.push({
      type: 'add',
      line: rightLines[rightIndex],
      leftLineNo: null,
      rightLineNo,
    });
    summary.additions += 1;
    rightIndex += 1;
    rightLineNo += 1;
  }

  return {
    summary,
    changes,
  };
}
