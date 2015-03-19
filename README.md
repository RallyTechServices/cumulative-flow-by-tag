#Cumulative Flow by Tags  (SDK 2.0rc3)

Shows the cumulative flow for stories associated either with a single portfolio item or a set of tags (or combination of both) for the selected timebox.

Timebox is determined by the selected portfolio item Planned Start Date and Planned End Date.  A portfolio item must be selected in order to define the planned start and end dates, even if the cumulative flow diagram is not limited to the portfolio item hierarchy.

If the Restrict to Portfolio Item hierarchy is selected, then tags are optional.  If the Restrict to Portfolio Item hierarchy is not selected, then the user must select at least 1 tag.

Given the criteria of selected portfolio item (if hierarchy is restricted) and\or selected tags, the app first fetches all lowest level portfolio items (aka Features) associated with the criteria as of the current date.

The data set for the cumulative flow includes all stories associated with the resulting collection of lowest level portfolio items.

The cumulative flow is calculated using the TimeSeriesCalculator.

Additional calculations are:

The totalEstimated series is calculated by taking the maximum of the following:
[PortfolioItem]LeafPlanEstimateTotal or [PortfolioItem]DerivedPreliminaryEstimate

The DerivedPreliminaryEstimate is the sum of the FeaturePreliminary estimates converted to their quantitative values.

Additional trendlines on the chart are:
Actual - Starts at 0 on the date the first story went into an In-Progress state and to the total accepted points on the current date or the end of the date range.
Ideal - Starts at 0 on the PlannedStartDate and extends to the total points on the PlannedEndDate.
Remaining - If the current date is within the selected timebox, then the remaining line is drawn using from an arbitrary point before the current date to the plannedEndDate.
The remaining line has a slope calculated as follows:  deltaPoints/deltaDays
where:
    deltaPoints = totalPoints-acceptedPoints (as of current date)
    deltaDays = plannedEndDate - currentDate

![ScreenShot](/images/cumulative-flow-by-tag.png)


To upgrade this app to use milestones instead of tags, we will need to do the following:
*  Upgrade to SDK 2.0 since Milestones are better supported in the new SDK
*  Replace\add Milestone selection drop down
*  Update the retrieval of the PortfolioItem ids in the app.js file to include filtering\querying by Milestone
*  Calculator and grid should not need to be modified.