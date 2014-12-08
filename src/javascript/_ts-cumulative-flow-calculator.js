Ext.define("CumulativeFlowCalculator", {
     extend: "Rally.data.lookback.calculator.TimeSeriesCalculator",
     config: {
         stateFieldName: 'ScheduleState',
         stateFieldValues: ['Defined', 'In-Progress', 'Completed', 'Accepted', 'Finished'],
         lowestLevelPortfolioItemType: '',
         portfolioItemStateDone: '',
         portfolioItemStateName: '',
         preliminaryEstimateMap: []
     },
     InProgressName: 'In-Progress',
     AcceptedName: 'Accepted',
     actualPoints: 0,
     actualIndex: 0,
     totalPoints: 0,
     constructor: function(config) {
         this.initConfig(config);
         this.callParent(arguments);
     },
     runCalculation: function (snapshots) {
         console.log('runCalculation',this.config);
         var calculatorConfig = this._prepareCalculatorConfig(),
             seriesConfig = this._buildSeriesConfig(calculatorConfig);

         var calculator = this.prepareCalculator(calculatorConfig);
         calculator.addSnapshots(snapshots, this._getStartDate(snapshots), this._getEndDate(snapshots));
         
         var calcs = this._transformLumenizeDataToHighchartsSeries(calculator, seriesConfig);

         var total_series = this.getSeriesByName('TotalEstimated',calcs);
         this.totalPoints = total_series.data[calcs.categories.length-1];
         
         var actual_series = this._getActualSeries(calcs);
         calcs.series.push(actual_series);
        
         var ideal_series = this._getIdealSeries(calcs);
         calcs.series.push(ideal_series);
         
         var remaining_series = this._getRemainingSeries(calcs);
         if (remaining_series){
             calcs.series.push(remaining_series);
         }
         
         //Format the categories by week 
         var new_categories = _.map(calcs.categories, function(c){
             var week = Rally.util.DateTime.format(new Date(c), 'W');
             var year = Rally.util.DateTime.format(new Date(c),'Y');
             return year.toString() + 'WW' + week.toString(); 
         });

         calcs.categories = new_categories;
         console.log('calcs',calcs);
         
         Ext.each(calcs.series, function(s){
             console.log(s.name);
             if (s.name == 'TotalEstimated'){
                 s.stack = 'total';
                 s.zIndex = 0;
                 s.color = '#CCCCCC';
             } else {
                 s.zIndex = 1;
             }
         });
         return calcs;
     },
     getPercentCompleted: function(){
         if (this.totalPoints > 0){
             return Ext.String.format("{0} % of {1} total points completed", (this.actualPoints / this.totalPoints * 100).toFixed(1), this.totalPoints);
         }
         return 'No total points to calculate % Completed';
     },
     _getRemainingSeries: function(calcs){

         var velocity = 0;

         if (this.actualIndex == 0 && this.actualPoints == 0 ||
                 this.actualIndex == calcs.categories.length-1){
             return null; 
         }
         var data = [];
         for (var i=0; i< calcs.categories.length; i++){
             data[i] = null;
        }
         
        data[this.actualIndex] = this.actualPoints;
        data[calcs.categories.length-1] = this.totalPoints;
        var delta_points = data[calcs.categories.length-1] - data[this.actualIndex];
        
        //calculate velocity and slope of the line
        var endDate = calcs.categories[calcs.categories.length-1];
        var startDate = calcs.categories[this.actualIndex];
        var delta_days = Rally.util.DateTime.getDifference(new Date(endDate),new Date(startDate),'day');
        var delta_weeks = Rally.util.DateTime.getDifference(new Date(endDate),new Date(startDate), 'week');
        
        var slope = delta_points/delta_days;  
        var velocity = delta_points/delta_weeks;

        var arbitrary_index = Math.round(this.actualIndex/2);
        var arbitrary_date = calcs.categories[arbitrary_index];
        var arbitrary_delta_days = Rally.util.DateTime.getDifference(new Date(endDate), new Date(arbitrary_date), 'day');
        var arbitrary_points = this.totalPoints - slope * arbitrary_delta_days;
        data[arbitrary_index] = arbitrary_points;
        
        console.log('endDate', endDate, 'startDate',startDate, 'delta days', delta_days, 'delta_weeks', delta_weeks);
        
         var series = {
                 name: Ext.String.format('Remaining (velocity: {0})',velocity),
                 type: 'line',
                 data: data,
                 color: '',
                 dashStyle: 'Solid',
                 stack: 'remaining'
         };
         console.log('remaining',series);
         return series;
     },
     _getIdealSeries: function(calcs){
         var data = [];
         var endDate = new Date(this.getEndDate());
         var startDate = new Date(this.getStartDate());
         var totalPoints = Number(this.totalPoints);
         var num_velocity_periods = Rally.util.DateTime.getDifference(endDate, startDate,'week')/2;
         var velocity = 0;
         var data = [];
         var startDatei = 0;

         var endDatei = calcs.categories.length-1;  
         
         for(var i=0; i< calcs.categories.length; i++){
            var d = new Date(calcs.categories[i]);
            data[i] = null; 
            if (d.getYear() == startDate.getYear() && 
                 d.getMonth() == startDate.getMonth() && 
                 d.getDate() == startDate.getDate()){
                startDatei = i;
            }
            if (d.getYear() == endDate.getYear() && 
                    d.getMonth() == endDate.getMonth() && 
                    d.getDate() == endDate.getDate()){
                endDatei = i;   
               }
         };
         velocity = Math.round(totalPoints/num_velocity_periods);  
         data[startDatei] = 0;
         data[endDatei] = totalPoints;
         var series = {
                 name: Ext.String.format('Ideal (velocity: {0})',velocity),
                 type: 'line',
                 data: data,
                 color: '',
                 dashStyle: 'Solid',
                 stack: 'ideal'
         };
         console.log('idealseries',series);
         return series;
     },
     _getActualSeries: function(calcs){

         var data = []; 
         var num_velocity_periods = Rally.util.DateTime.getDifference(new Date(calcs.categories[calcs.categories.length-1]), new Date(calcs.categories[0]),'week')/2;
         var velocity = 0;
         var firstInProgressi = 0;
         var states = this.getStateFieldValues(); 
         var firstInState = [];
         for (var i=0; i<states.length; i++){
             firstInState[i] = -1;
         }
         this.actualPoints = 0 ;
         this.actualIndex = 0; 
         var currentDate = new Date();
         for(var i=0; i< calcs.categories.length; i++){
             var d = new Date(calcs.categories[i]);
             data[i] = null; 
             if (d.getYear() >= currentDate.getYear() && 
                  d.getMonth() >= currentDate.getMonth() && 
                  d.getDate() >= currentDate.getDate()){
                 this.actualIndex = i;
             }
          };
          if (this.actualIndex == 0){
              this.actualIndex = calcs.categories.length-1;
          }

         
         Ext.each(calcs.series, function(s){
             console.log(s.name);
             var idx = Ext.Array.indexOf(states, s.name, 0);
             if (idx >= 0 && firstInState[idx] <0){
                 for (var i=0; i<s.data.length; i++){
                     if (s.data[i] > 0){
                         firstInState[idx] = i;
                         i = s.data.length; 
                     }
                 }
             }
             if (s.name == this.AcceptedName){
//                 _.range(s.data.length).map(function () { return null });
                 for (var i=0; i<s.data.length; i++){
                     data[i] = null;
                 }
                 this.actualPoints = s.data[this.actualIndex];
             }
         }, this);
         

         //Get the date of first inprogress.  If that doesn't work, then get the first date of the next state
         var actual_start_index = 0;  
         var idx = Ext.Array.indexOf(states, this.InProgressName, 0);
         for (var j=idx; j<firstInState.length; j++){
             if (firstInState[j] >= 0){
                 actual_start_index = firstInState[j];
                 j = firstInState.length; 
             }
         }
         
         data[actual_start_index] = 0;
         data[this.actualIndex] = this.actualPoints; 
         velocity = Math.round(this.actualPoints/num_velocity_periods);  
         
         var series = {
                 name: Ext.String.format('Actual (velocity: {0})',velocity),
                 type: 'line',
                 data: data,
                 color: '',
                 dashStyle: 'Solid',
                 stack: 'actual'
         };
         console.log(series);
         
         
         return series;
     },
     getMetrics: function() {
         var metrics = [];
         Ext.each(this.getStateFieldValues(), function(stateFieldValue){
             metrics.push({
                 field: 'PlanEstimate',
                 as: stateFieldValue,
                 f: 'filteredSum',
                 filterField: this.getStateFieldName(),
                 filterValues: [stateFieldValue],
                 display: 'area',
             });  
         }, this);
         
         metrics.push({
             field: 'DerivedLeafStoryPlanEstimateTotal',
             as: 'DerivedLeafStoryPlanEstimateTotal',
             f: 'sum',
         });

         metrics.push({
             field: 'DerivedPreliminaryEstimate',
             as: 'DerivedPreliminaryEstimate',
             f: 'sum',
         });

         return metrics; 
         
     },
       getDerivedFieldsOnInput: function(){
           return [{
               f: this.getDerivedPreliminaryEstimate,
               as: 'DerivedPreliminaryEstimate',
               preliminaryEstimateMap: this.preliminaryEstimateMap
            },{
                f: this.getDerivedLeafStoryPlanEstimateTotal,
                as: 'DerivedLeafStoryPlanEstimateTotal'
             }];
    },
    getDerivedLeafStoryPlanEstimateTotal: function(snapshot){
        if (snapshot.LeafStoryPlanEstimateTotal){
            return Number(snapshot.LeafStoryPlanEstimateTotal);
        }
        return 0; 
    },
     getDerivedFieldsAfterSummary: function(){
         return [{
             f: this.getTotalEstimated,
             as: 'TotalEstimated',
             display: 'area',
             color: 'gray',
             stack: null
          }];
     },
     getDerivedPreliminaryEstimate: function(snapshot){
         if (snapshot.PreliminaryEstimate){
             return this.preliminaryEstimateMap[snapshot.PreliminaryEstimate];
         }
         return 0;
     },
     getTotalEstimated: function(snapshot,index,metrics,seriesData){
         console.log('getTotalEstimates',snapshot,index,metrics,seriesData);
         return Math.max(seriesData[index].DerivedPreliminaryEstimate,seriesData[index].DerivedLeafStoryPlanEstimateTotal);
     },
     calcTotalPoints: function(calcs){
         Ext.each(calcs.series, function(s){
             if (s.name == 'TotalEstimated'){
                 return Number(s.data[calcs.categories.length-1]);
             }
         },this);
     },
     getSeriesByName: function(seriesName, calcs){
         var series = null; 
         Ext.each(calcs.series, function(s){
             var re = new RegExp(seriesName,"i");
             console.log(re,s.name,re.test(s.name));
             if (re.test(s.name)){
                 series = s;  
             }
         });
         return series; 
     }

//     getDerivedTotalEstimate: function(snapshot){
//         console.log(this);
//         console.log(snapshot._TypeHierarchy,this.lowestLevelPortfolioItemType,snapshot.State,snapshot.LeafStoryPlanEstimateTotal);
//         if (Ext.Array.contains(snapshot._TypeHierarchy, 'PortfolioItem/Feature')){
//             if (snapshot.State == this.portfolioItemStateDone){
//                 return Number(snapshot.LeafStoryPlanEstimateTotal);
//             } else {
//                 var pe = -6;  //this._translatePreliminaryEstimate(snapshot.PreliminaryEstimate);
//                 var lspet = Number(snapshot.LeafStoryPlanEstimateTotal);
//                 return Math.max(lspet,pe);
//             }
//         }
//         return 0;
//     }

 });