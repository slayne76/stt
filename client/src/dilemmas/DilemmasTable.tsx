import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { CheckCircle, Cancel, FiberManualRecord } from '@mui/icons-material';
import type { Choice, Dilemma } from '../types/dilemma';
import type { CatalogEntry } from '../types/catalogEntry';
import { getChoiceIcon, type ChoiceIconKind } from './getters';
import Thumbnail from '../assets/Thumbnail';
import { ASSET_BASE_URL } from '../assets/config';
import { BLOCK_BOUNDARY_COLOR } from '../theme';

export interface DilemmasTableProps {
  // Must already be sorted by chainName then partNumber (see getters.ts's
  // sortedDilemmas) — this component only reads adjacency, it doesn't sort.
  dilemmas: Dilemma[];
  catalogMap: Map<number, CatalogEntry>;
  // chainName -> how many dilemmas share it (see getters.ts's
  // getChainSizeByName) — drives the "(part x/y)" subtitle, shown only
  // when a dilemma's own chain size is > 1.
  chainSizeByName: Map<string, number>;
}

function ChoiceIcon({ kind }: { kind: ChoiceIconKind }) {
  if (kind === 'check') return <CheckCircle fontSize="small" color="success" />;
  if (kind === 'x') return <Cancel fontSize="small" color="error" />;
  return <FiberManualRecord fontSize="small" sx={{ color: 'rgba(0, 0, 0, 0.38)' }} />;
}

function ChoicesList({ dilemma }: { dilemma: Dilemma }) {
  return (
    <Box>
      {dilemma.choices.map((choice) => (
        <Box key={choice.letter} sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75, py: 0.25 }}>
          <ChoiceIcon kind={getChoiceIcon(dilemma, choice)} />
          <Typography variant="body2">
            <Box component="span" sx={{ fontWeight: 'bold' }}>
              {choice.letter}:
            </Box>{' '}
            {choice.description}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

function rewardChoices(dilemma: Dilemma): Choice[] {
  return dilemma.choices.filter((c) => (c.rewards?.length ?? 0) > 0);
}

function RewardCell({ dilemma, catalogMap }: { dilemma: Dilemma; catalogMap: Map<number, CatalogEntry> }) {
  const choices = rewardChoices(dilemma);
  if (choices.length === 0) {
    return <Typography color="text.secondary">&mdash;</Typography>;
  }
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
      {choices.map((choice) => (
        <Box key={choice.letter} sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
          <Typography variant="body2" sx={{ fontWeight: 'bold', mt: 1.25 }}>
            {choice.letter}:
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            {(choice.rewards ?? []).map((reward) => {
              const entry = catalogMap.get(reward.crewArchetypeId);
              return (
                <Box
                  key={reward.crewArchetypeId}
                  sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 44 }}
                >
                  <Thumbnail url={entry ? `${ASSET_BASE_URL}/${entry.imageUrlPortrait}` : undefined} />
                  {reward.showName && (
                    <Typography variant="caption" align="center" sx={{ lineHeight: 1.1, mt: 0.25 }}>
                      {entry?.name ?? `#${reward.crewArchetypeId}`}
                    </Typography>
                  )}
                </Box>
              );
            })}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

function DropRateCell({ dilemma }: { dilemma: Dilemma }) {
  const choices = rewardChoices(dilemma);
  if (choices.length === 0) {
    return <Typography color="text.secondary">&mdash;</Typography>;
  }
  // Every reward within one choice's `rewards` array always shares the same
  // dropRatePercent (see Global Constraints) — rewards[0] speaks for the choice.
  const rates = choices.map((c) => (c.rewards ?? [])[0]?.dropRatePercent ?? 0);
  const uniform = rates.every((r) => r === rates[0]);
  if (uniform) {
    return <Typography variant="body2">{rates[0]}%</Typography>;
  }
  return (
    <Box>
      {choices.map((choice, i) => (
        <Typography key={choice.letter} variant="body2">
          {choice.letter}: {rates[i]}%
        </Typography>
      ))}
    </Box>
  );
}

function DilemmasTable({ dilemmas, catalogMap, chainSizeByName }: DilemmasTableProps) {
  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>#</TableCell>
            <TableCell>Name</TableCell>
            <TableCell>Choices</TableCell>
            <TableCell>Reward</TableCell>
            <TableCell>Drop Rate</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {dilemmas.map((dilemma, index) => {
            const isChainEnd =
              index === dilemmas.length - 1 || dilemmas[index + 1].chainName !== dilemma.chainName;
            const chainSize = chainSizeByName.get(dilemma.chainName) ?? 1;
            return (
              <TableRow
                key={dilemma.id}
                sx={isChainEnd ? { '& td': { borderBottom: `2px solid ${BLOCK_BOUNDARY_COLOR}` } } : undefined}
              >
                <TableCell>{index + 1}</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  {dilemma.name}
                  {chainSize > 1 && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      (part {dilemma.partNumber}/{chainSize})
                    </Typography>
                  )}
                </TableCell>
                <TableCell>
                  <ChoicesList dilemma={dilemma} />
                </TableCell>
                <TableCell>
                  <RewardCell dilemma={dilemma} catalogMap={catalogMap} />
                </TableCell>
                <TableCell>
                  <DropRateCell dilemma={dilemma} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export default DilemmasTable;
