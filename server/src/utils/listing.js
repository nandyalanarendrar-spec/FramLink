// A listing can be bought only while it is live, has stock and its sell-by date has not passed
export const liveFilter = () => ({
  status: { $in: ['active', 'partially_sold'] },
  availableQty: { $gt: 0 },
  deadline: { $gte: new Date() },
});
